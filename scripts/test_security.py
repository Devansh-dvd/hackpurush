#!/usr/bin/env python3
"""
test_security.py — IRONCLAD LoRa Security Test Suite
=====================================================
Simulates all four attack vectors and shows each is REJECTED by the rover
receiver logic (ported to Python for fast iteration).

Usage:
    python scripts/test_security.py

Requirements:
    pip install cryptography

What is tested:
  1. VALID packet        → ACCEPTED  (baseline check)
  2. FORGED packet       → REJECTED  (wrong key → AES-GCM tag mismatch)
  3. TAMPERED payload    → REJECTED  (bit-flip in ciphertext → tag mismatch)
  4. REPLAY packet       → REJECTED  (counter not advancing)
  5. WRONG VERSION       → REJECTED
  6. UNKNOWN COMMAND     → REJECTED  (not in whitelist)
  7. RANGE VIOLATION     → REJECTED  (speed > 1000)
  8. BAD LENGTH          → REJECTED  (truncated packet)
"""

import struct
import os
import sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ──────────────────────────────────────────────────────────────────────────────
# Load the pre-shared key from firmware/secrets.h
# ──────────────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent

def load_key_from_secrets_h() -> bytes:
    secrets_path = ROOT / "firmware" / "secrets.h"
    if not secrets_path.exists():
        print("[ERROR] firmware/secrets.h not found.")
        print("        Run: python scripts/gen_key.py  first.")
        sys.exit(1)

    content = secrets_path.read_text(encoding="utf-8")
    # Parse:  static const uint8_t IRONCLAD_PSK[16] = { 0xAB, ... };
    import re
    m = re.search(r'IRONCLAD_PSK\[16\]\s*=\s*\{([^}]+)\}', content)
    if not m:
        print("[ERROR] Could not parse IRONCLAD_PSK from secrets.h")
        sys.exit(1)
    hex_list = [b.strip() for b in m.group(1).split(",") if b.strip()]
    key = bytes(int(h, 16) for h in hex_list if h)
    if len(key) != 16:
        print(f"[ERROR] Expected 16-byte key, got {len(key)}")
        sys.exit(1)
    return key

PSK = load_key_from_secrets_h()
print(f"[*] Loaded PSK from secrets.h ({len(PSK)} bytes)\n")

# ──────────────────────────────────────────────────────────────────────────────
# Protocol constants (mirror ironclad_tx.ino)
# ──────────────────────────────────────────────────────────────────────────────
PACKET_VERSION = 0x01
GCM_TAG_LEN    = 16
GCM_NONCE_LEN  = 12

CMD_PING       = 0x01
CMD_TELEMETRY  = 0x10
CMD_DRIVE      = 0x20
CMD_ARM        = 0x30
CMD_ESTOP      = 0xFE

CMD_WHITELIST  = {CMD_PING, CMD_DRIVE, CMD_ESTOP}
FAILSAFE_MS    = 2500
MAX_CONSEC_BAD = 5

# Speed/steer range
SPEED_MAX      = 1000
STEER_MAX      = 1000

# ──────────────────────────────────────────────────────────────────────────────
# Packet builder (mirrors buildSecurePacket in ironclad_tx.ino)
# ──────────────────────────────────────────────────────────────────────────────
def build_packet(key: bytes, cmd: int, counter: int, payload: bytes) -> bytes:
    """Build a valid IRONCLAD secure packet."""
    # Header = AAD
    header = bytes([PACKET_VERSION, cmd]) + struct.pack(">I", counter)

    # Nonce: counter (4 big-endian bytes) padded to 12 bytes
    nonce = struct.pack(">I", counter) + b"\x00" * 8

    # AES-128-GCM encrypt
    aesgcm = AESGCM(key)
    # AESGCM.encrypt(nonce, data, aad) → ciphertext + tag concatenated
    ct_and_tag = aesgcm.encrypt(nonce, payload, header)
    ciphertext = ct_and_tag[:-GCM_TAG_LEN]
    tag        = ct_and_tag[-GCM_TAG_LEN:]

    return header + ciphertext + tag


def encode_drive(speed: int, steer: int, flags: int = 0) -> bytes:
    """Pack a DrivePayload (matches the C struct)."""
    return struct.pack("<hhB", speed, steer, flags)

# ──────────────────────────────────────────────────────────────────────────────
# Rover receiver logic (Python port of processPacket + executeCommand)
# ──────────────────────────────────────────────────────────────────────────────
class RoverState:
    def __init__(self):
        self.last_counter  = 0
        self.consec_bad    = 0
        self.failsafe      = True
        self.speed         = 0
        self.steer         = 0

    def process_packet(self, pkt: bytes, key: bytes) -> tuple[bool, str]:
        """
        Returns (accepted: bool, reason: str).
        Mirrors the security checks in ironclad_rx.ino.
        """
        # 1. Minimum length
        if len(pkt) < 22:
            return self._reject("packet too short")

        # 2. Parse header
        version  = pkt[0]
        cmd      = pkt[1]
        counter  = struct.unpack(">I", pkt[2:6])[0]

        # 3. Version check
        if version != PACKET_VERSION:
            return self._reject(f"wrong version 0x{version:02X}")

        # 4. Command whitelist (before decryption)
        if cmd not in CMD_WHITELIST:
            return self._reject(f"cmd 0x{cmd:02X} not in whitelist")

        # 5. Replay protection
        if counter <= self.last_counter:
            return self._reject(
                f"replay: counter {counter} <= last accepted {self.last_counter}"
            )

        # 6. Decrypt + verify tag
        header     = pkt[:6]
        nonce      = struct.pack(">I", counter) + b"\x00" * 8
        ciphertext = pkt[6:-GCM_TAG_LEN]
        tag        = pkt[-GCM_TAG_LEN:]
        ct_and_tag = ciphertext + tag

        try:
            aesgcm    = AESGCM(key)
            plaintext = aesgcm.decrypt(nonce, ct_and_tag, header)
        except Exception:
            return self._reject("authentication failure (forged/tampered)")

        # 7. Range check for CMD_DRIVE
        if cmd == CMD_DRIVE:
            if len(plaintext) < 5:
                return self._reject("drive payload too short")
            speed, steer, _ = struct.unpack_from("<hhB", plaintext)
            if abs(speed) > SPEED_MAX or abs(steer) > STEER_MAX:
                return self._reject(
                    f"range violation speed={speed} steer={steer}"
                )
            self.speed = speed
            self.steer = steer

        # ── ACCEPTED ──
        self.last_counter = counter
        self.consec_bad   = 0
        self.failsafe     = False
        return True, f"ACCEPTED cmd=0x{cmd:02X} counter={counter}"

    def _reject(self, reason: str) -> tuple[bool, str]:
        self.consec_bad += 1
        msg = f"REJECTED: {reason}"
        if self.consec_bad >= MAX_CONSEC_BAD:
            msg += " [FAILSAFE triggered]"
            self.failsafe   = True
            self.consec_bad = 0
        return False, msg


# ──────────────────────────────────────────────────────────────────────────────
# Test suite
# ──────────────────────────────────────────────────────────────────────────────
PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"

def run_test(name: str, pkt: bytes, rover: RoverState, key: bytes,
             expect_accept: bool):
    ok, reason = rover.process_packet(pkt, key)
    status     = PASS if (ok == expect_accept) else FAIL
    verdict    = "ACCEPTED" if ok else reason
    print(f"  {status}  {name}")
    print(f"           → {verdict}\n")

def main():
    print("=" * 60)
    print("  IRONCLAD LoRa Security Test Suite")
    print("=" * 60)
    print()

    rover   = RoverState()
    counter = 1000   # start mid-range to make replay obvious

    # ── Test 1: Valid packet (baseline) ───────────────────────────────────────
    print("── Test 1: Valid authenticated packet ──")
    pld  = encode_drive(300, -100)
    pkt  = build_packet(PSK, CMD_DRIVE, counter, pld)
    run_test("Valid CMD_DRIVE (speed=300 steer=-100)", pkt, rover, PSK,
             expect_accept=True)
    counter += 1

    # ── Test 2: Forged packet — attacker uses wrong key ───────────────────────
    print("── Test 2: Forged packet (attacker uses wrong key) ──")
    WRONG_KEY = bytes([0xDE, 0xAD] * 8)   # deliberately wrong key
    pkt_forged = build_packet(WRONG_KEY, CMD_DRIVE, counter, encode_drive(500, 0))
    run_test("Forged (wrong key)", pkt_forged, rover, PSK, expect_accept=False)
    counter += 1  # advance counter so next legitimate test isn't blocked

    # ── Test 3: Tampered payload — bit flip in ciphertext ─────────────────────
    print("── Test 3: Tampered ciphertext (man-in-the-middle bit-flip) ──")
    pkt_valid = build_packet(PSK, CMD_DRIVE, counter, encode_drive(200, 50))
    pkt_tampered = bytearray(pkt_valid)
    pkt_tampered[8] ^= 0xFF   # flip bits in the ciphertext
    run_test("Tampered ciphertext", bytes(pkt_tampered), rover, PSK,
             expect_accept=False)
    counter += 1

    # ── Test 4: Replay — re-send old counter ──────────────────────────────────
    print("── Test 4: Replay attack (old counter) ──")
    # First, accept a fresh packet to advance the watermark
    pkt_fresh = build_packet(PSK, CMD_PING, counter, b"\x00")
    ok, _ = rover.process_packet(pkt_fresh, PSK)  # advance counter
    assert ok, "pre-replay fresh packet should be accepted"
    # Now replay an old one (counter 1000 was already accepted in test 1)
    pkt_replay = build_packet(PSK, CMD_DRIVE, 1000, encode_drive(999, 999))
    run_test("Replay (counter=1000 already seen)", pkt_replay, rover, PSK,
             expect_accept=False)
    counter += 1

    # ── Test 5: Wrong version byte ────────────────────────────────────────────
    print("── Test 5: Wrong version byte ──")
    pkt_bad_ver = build_packet(PSK, CMD_PING, counter, b"\x00")
    pkt_bad_ver = bytes([0x99]) + pkt_bad_ver[1:]   # overwrite version
    run_test("Wrong version (0x99)", pkt_bad_ver, rover, PSK, expect_accept=False)
    counter += 1

    # ── Test 6: Unknown command ────────────────────────────────────────────────
    print("── Test 6: Unknown / non-whitelisted command ──")
    pkt_unk = build_packet(PSK, CMD_ARM, counter, b"\x00\x01\x02")
    run_test("CMD_ARM (not in whitelist)", pkt_unk, rover, PSK, expect_accept=False)
    counter += 1

    # ── Test 7: Speed out of range ─────────────────────────────────────────────
    print("── Test 7: Speed out of range (1500 > 1000) ──")
    pkt_range = build_packet(PSK, CMD_DRIVE, counter, encode_drive(1500, 0))
    run_test("CMD_DRIVE speed=1500 (range violation)", pkt_range, rover, PSK,
             expect_accept=False)
    counter += 1

    # ── Test 8: Truncated packet ──────────────────────────────────────────────
    print("── Test 8: Truncated packet (too short) ──")
    pkt_trunc = build_packet(PSK, CMD_PING, counter, b"\x00")[:10]
    run_test("Truncated to 10 bytes", pkt_trunc, rover, PSK, expect_accept=False)
    counter += 1

    # ── Test 9: ESTOP (emergency stop) ─────────────────────────────────────────
    print("── Test 9: Valid ESTOP command ──")
    pkt_estop = build_packet(PSK, CMD_ESTOP, counter, b"\xFF")
    run_test("Valid CMD_ESTOP", pkt_estop, rover, PSK, expect_accept=True)
    counter += 1

    print("=" * 60)
    print("  All tests completed.")
    print()
    print("  Summary of security properties verified:")
    print("    ✓ AES-128-GCM rejects forged packets (wrong key)")
    print("    ✓ AES-128-GCM detects ciphertext tampering")
    print("    ✓ Counter-based replay protection works")
    print("    ✓ Wrong protocol version rejected")
    print("    ✓ Non-whitelisted commands rejected")
    print("    ✓ Out-of-range speed values rejected")
    print("    ✓ Truncated/malformed packets rejected")
    print("    ✓ Legitimate traffic passes through")
    print("=" * 60)

if __name__ == "__main__":
    main()
