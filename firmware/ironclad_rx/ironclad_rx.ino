/*
 * ironclad_rx.ino  — IRONCLAD Secure LoRa Receiver (Rover side)
 * ==============================================================
 * MCU   : ESP32 (Heltec WiFi LoRa 32 v2  or  TTGO LoRa32)
 * Radio : SX1276 / SX1278
 *
 * Libraries required (Arduino Library Manager):
 *   • Heltec ESP32 Dev-Boards  (or standard ESP32 board support)
 *   • AESLib  (by kakopappa)  ← AES-128-GCM
 *   • Arduino-LoRa (by Sandeep Mistry)
 *
 * Security model:
 *   1.  AES-128-GCM authenticated decryption — rejects tampered/forged packets.
 *   2.  Replay protection — rejects counter ≤ last accepted counter.
 *       Last accepted counter is persisted in EEPROM across reboots.
 *   3.  Command whitelist — only CMD_DRIVE, CMD_PING, CMD_ESTOP accepted.
 *   4.  Value range checks — speed/steer must be within ±1000.
 *   5.  Failsafe — motors stop if no valid packet received within FAILSAFE_MS.
 *   6.  Bad-packet counter — ESTOP after N consecutive bad packets.
 *   7.  Serial debug log — reason code only, NO key material.
 *
 * Packet wire format (see ironclad_tx.ino for full description):
 *   [version 1B][cmd 1B][counter big-endian 4B][ciphertext][GCM-tag 16B]
 */

#include "secrets.h"        // gitignored — copy from secrets.example.h
#include <AESLib.h>
#include <LoRa.h>
#include <EEPROM.h>

// ─── Board pin-map (Heltec WiFi LoRa 32 v2) ─────────────────────────────────
#define LORA_SCK    5
#define LORA_MISO  19
#define LORA_MOSI  27
#define LORA_SS    18
#define LORA_RST   14
#define LORA_DIO0  26

// ─── Motor driver pins ───────────────────────────────────────────────────────
// Adjust to match your H-bridge (L298N, DRV8833, etc.)
#define MOTOR_L_FWD  32
#define MOTOR_L_REV  33
#define MOTOR_R_FWD  25
#define MOTOR_R_REV  26

// ─── LoRa config — must match TX ─────────────────────────────────────────────
#define LORA_FREQ    433E6
#define LORA_BW      125000
#define LORA_SF      9
#define LORA_CR      5

// ─── Protocol ────────────────────────────────────────────────────────────────
#define PACKET_VERSION   0x01

#define CMD_TELEMETRY    0x10
#define CMD_DRIVE        0x20
#define CMD_ARM          0x30
#define CMD_ESTOP        0xFE
#define CMD_PING         0x01

// Command whitelist (only these are accepted by the rover)
static const uint8_t CMD_WHITELIST[] = {
    CMD_DRIVE, CMD_ESTOP, CMD_PING
};
static const uint8_t CMD_WHITELIST_LEN = sizeof(CMD_WHITELIST);

// ─── Security constants ──────────────────────────────────────────────────────
#define AES_KEY_LEN     16
#define GCM_TAG_LEN     16
#define GCM_NONCE_LEN   12

// ─── Failsafe parameters ─────────────────────────────────────────────────────
#define FAILSAFE_MS            2500   // stop if no valid packet within 2.5 s
#define MAX_CONSECUTIVE_BAD    5      // ESTOP after 5 consecutive bad packets

// ─── EEPROM ──────────────────────────────────────────────────────────────────
#define EEPROM_SIZE             8
#define EEPROM_COUNTER_ADDR     0    // 4 bytes: last accepted counter

// ─── Globals ──────────────────────────────────────────────────────────────────
static uint32_t lastAcceptedCounter = 0;   // replay-protection watermark
static unsigned long lastValidMs     = 0;   // timestamp of last valid packet
static unsigned int  consecutiveBad  = 0;   // count of consecutive rejected pkts
static bool          failsafeActive  = true; // start in safe state until 1st valid pkt
static AESLib        aesLib;

// ─── EEPROM helpers ──────────────────────────────────────────────────────────
void loadLastCounter() {
    EEPROM.begin(EEPROM_SIZE);
    uint32_t saved = 0;
    EEPROM.get(EEPROM_COUNTER_ADDR, saved);
    lastAcceptedCounter = saved;
    Serial.printf("[RX] Last accepted counter (from EEPROM): %u\n", lastAcceptedCounter);
}

void persistLastCounter(uint32_t val) {
    EEPROM.put(EEPROM_COUNTER_ADDR, val);
    EEPROM.commit();
}

// ─── Motor control ────────────────────────────────────────────────────────────
void motorsStop() {
    digitalWrite(MOTOR_L_FWD, LOW); digitalWrite(MOTOR_L_REV, LOW);
    digitalWrite(MOTOR_R_FWD, LOW); digitalWrite(MOTOR_R_REV, LOW);
}

// speed -1000..+1000, steer -1000..+1000
// Tank-drive mixing: left = speed + steer, right = speed - steer
void setMotors(int16_t speed, int16_t steer) {
    int leftPwm  = constrain(speed + steer, -1000, 1000);
    int rightPwm = constrain(speed - steer, -1000, 1000);

    // Scale to 0-255 PWM
    analogWrite(MOTOR_L_FWD, leftPwm  > 0 ? map(leftPwm,  0, 1000, 0, 255) : 0);
    analogWrite(MOTOR_L_REV, leftPwm  < 0 ? map(-leftPwm, 0, 1000, 0, 255) : 0);
    analogWrite(MOTOR_R_FWD, rightPwm > 0 ? map(rightPwm, 0, 1000, 0, 255) : 0);
    analogWrite(MOTOR_R_REV, rightPwm < 0 ? map(-rightPwm,0, 1000, 0, 255) : 0);
}

// ─── Reject reasons for debug log ────────────────────────────────────────────
// Only the reason is logged — never key bytes or plaintext.
enum RejectReason {
    RR_OK = 0,
    RR_TOO_SHORT,       // packet shorter than minimum
    RR_BAD_VERSION,     // version byte != PACKET_VERSION
    RR_UNKNOWN_CMD,     // cmd not in whitelist
    RR_DECRYPT_FAIL,    // AES-GCM tag mismatch (forged / tampered)
    RR_REPLAY,          // counter <= last accepted (replay attack)
    RR_RANGE_CHECK,     // payload values out of legal range
};

static const char* rejectStr(RejectReason r) {
    switch (r) {
        case RR_TOO_SHORT:    return "REJECT: packet too short";
        case RR_BAD_VERSION:  return "REJECT: wrong version byte";
        case RR_UNKNOWN_CMD:  return "REJECT: command not in whitelist";
        case RR_DECRYPT_FAIL: return "REJECT: authentication failure (forged/tampered)";
        case RR_REPLAY:       return "REJECT: replay — counter not advancing";
        case RR_RANGE_CHECK:  return "REJECT: payload values out of range";
        default:              return "REJECT: unknown reason";
    }
}

// ─── Command payload structs ──────────────────────────────────────────────────
struct DrivePayload {
    int16_t speed;
    int16_t steer;
    uint8_t flags;
};

// ─── Core: verify + decrypt a received LoRa packet ─────────────────────────
//
// Returns RR_OK and populates cmd/counter/plaintext on success.
// On failure returns the reject reason — caller should log it.
//
RejectReason processPacket(
    const uint8_t *pkt, size_t pktLen,
    uint8_t &cmd, uint32_t &counter,
    uint8_t *plaintext, size_t &plaintextLen
) {
    // Minimum: 6 header + 0 payload + 16 tag = 22 bytes
    if (pktLen < 22) return RR_TOO_SHORT;

    // Parse header (AAD)
    uint8_t version = pkt[0];
    cmd             = pkt[1];
    counter  = ((uint32_t)pkt[2] << 24)
             | ((uint32_t)pkt[3] << 16)
             | ((uint32_t)pkt[4] <<  8)
             | ((uint32_t)pkt[5]      );

    if (version != PACKET_VERSION) return RR_BAD_VERSION;

    // Command whitelist check (before decryption — saves CPU on obvious junk)
    bool cmdOk = false;
    for (uint8_t i = 0; i < CMD_WHITELIST_LEN; i++) {
        if (cmd == CMD_WHITELIST[i]) { cmdOk = true; break; }
    }
    if (!cmdOk) return RR_UNKNOWN_CMD;

    // Replay protection: counter must be strictly greater than last accepted
    if (counter <= lastAcceptedCounter) return RR_REPLAY;

    // Build nonce from counter (same as TX side)
    uint8_t nonce[GCM_NONCE_LEN] = {0};
    nonce[0] = pkt[2]; nonce[1] = pkt[3];
    nonce[2] = pkt[4]; nonce[3] = pkt[5];

    // Ciphertext length = pktLen - 6 (header) - 16 (tag)
    size_t cipherLen = pktLen - 6 - GCM_TAG_LEN;
    const uint8_t *ciphertext = pkt + 6;
    const uint8_t *tag        = pkt + 6 + cipherLen;

    // AES-128-GCM decrypt + verify tag
    // AESLib::gcm_decrypt returns 0 on success, non-zero on tag mismatch
    int ret = aesLib.gcm_decrypt(
        (uint8_t *)IRONCLAD_PSK, AES_KEY_LEN,
        (uint8_t *)nonce, GCM_NONCE_LEN,
        (uint8_t *)pkt, 6,         // AAD = header
        (uint8_t *)ciphertext, cipherLen,
        plaintext,
        (uint8_t *)tag
    );

    if (ret != 0) return RR_DECRYPT_FAIL;   // tampered or forged

    plaintextLen = cipherLen;
    return RR_OK;
}

// ─── Execute a verified, decrypted command ───────────────────────────────────
void executeCommand(uint8_t cmd, const uint8_t *payload, size_t payloadLen) {
    switch (cmd) {
        case CMD_DRIVE: {
            if (payloadLen < sizeof(DrivePayload)) {
                Serial.println("[RX] REJECT: drive payload too short");
                return;
            }
            DrivePayload pld;
            memcpy(&pld, payload, sizeof(pld));

            // Range check: speed and steer must be within ±1000
            if (abs(pld.speed) > 1000 || abs(pld.steer) > 1000) {
                Serial.printf("[RX] REJECT: drive range check failed (speed=%d steer=%d)\n",
                              pld.speed, pld.steer);
                consecutiveBad++;
                return;
            }

            Serial.printf("[RX] CMD_DRIVE speed=%d steer=%d flags=0x%02X\n",
                          pld.speed, pld.steer, pld.flags);
            setMotors(pld.speed, pld.steer);
            break;
        }

        case CMD_ESTOP:
            Serial.println("[RX] CMD_ESTOP — halting");
            motorsStop();
            break;

        case CMD_PING:
            // Keep-alive — nothing to do except reset failsafe timer (done by caller)
            Serial.println("[RX] CMD_PING — link alive");
            break;

        default:
            // Should not reach here (whitelist check already done)
            Serial.printf("[RX] BUG: unhandled whitelisted cmd 0x%02X\n", cmd);
            break;
    }
}

// ─── setup / loop ─────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[RX] IRONCLAD Secure LoRa Rover Receiver v1.0");

    // Motor pins
    pinMode(MOTOR_L_FWD, OUTPUT); pinMode(MOTOR_L_REV, OUTPUT);
    pinMode(MOTOR_R_FWD, OUTPUT); pinMode(MOTOR_R_REV, OUTPUT);
    motorsStop();   // safe state on boot

    // Load persisted replay counter
    loadLastCounter();

    // LoRa init
    SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
    LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

    if (!LoRa.begin(LORA_FREQ)) {
        Serial.println("[RX] FATAL: LoRa init failed");
        while (true) { delay(1000); }
    }

    LoRa.setSignalBandwidth(LORA_BW);
    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setCodingRate4(LORA_CR);
    LoRa.enableCrc();

    Serial.printf("[RX] LoRa ready — %.0f MHz, SF%d\n", (double)LORA_FREQ, LORA_SF);
    Serial.println("[RX] Waiting for first valid authenticated packet…");
}

void loop() {
    // ─── Failsafe: stop if link goes dead ─────────────────────────────────────
    if (!failsafeActive) {
        unsigned long now = millis();
        if (now - lastValidMs > FAILSAFE_MS) {
            Serial.printf("[RX] FAILSAFE: no valid packet for %lums — stopping motors\n",
                          now - lastValidMs);
            motorsStop();
            failsafeActive = true;
        }
    }

    // ─── Receive LoRa packet ───────────────────────────────────────────────────
    int pktSize = LoRa.parsePacket();
    if (pktSize <= 0) return;

    // Read into buffer
    uint8_t buf[256];
    size_t  len = 0;
    while (LoRa.available() && len < sizeof(buf)) {
        buf[len++] = LoRa.read();
    }

    int16_t rssi = LoRa.packetRssi();
    Serial.printf("[RX] Air packet %u bytes RSSI %d — processing…\n", len, rssi);

    // ─── Verify + decrypt ─────────────────────────────────────────────────────
    uint8_t  cmd = 0, plaintext[256] = {0};
    uint32_t counter = 0;
    size_t   plaintextLen = 0;

    RejectReason reason = processPacket(buf, len, cmd, counter, plaintext, plaintextLen);

    if (reason != RR_OK) {
        // Log rejection reason — NO key material, NO plaintext
        Serial.printf("[RX] %s (counter=%u rssi=%d)\n", rejectStr(reason), counter, rssi);
        consecutiveBad++;

        if (consecutiveBad >= MAX_CONSECUTIVE_BAD) {
            Serial.printf("[RX] FAILSAFE: %d consecutive bad packets — E-STOP\n",
                          consecutiveBad);
            motorsStop();
            failsafeActive = true;
            consecutiveBad = 0;
        }
        return;
    }

    // ─── Packet is authentic and fresh ────────────────────────────────────────
    consecutiveBad   = 0;
    failsafeActive   = false;
    lastValidMs      = millis();

    // Update and persist the replay-protection watermark
    lastAcceptedCounter = counter;
    persistLastCounter(counter);

    Serial.printf("[RX] ACCEPTED cmd=0x%02X counter=%u rssi=%d\n", cmd, counter, rssi);

    // Execute the command
    executeCommand(cmd, plaintext, plaintextLen);
}
