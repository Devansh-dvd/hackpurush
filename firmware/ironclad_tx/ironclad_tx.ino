/*
 * ironclad_tx.ino  — IRONCLAD Secure LoRa Transmitter (Controller / Laptop side)
 * ================================================================================
 * MCU   : ESP32 (Heltec WiFi LoRa 32 v2  or  TTGO LoRa32 v1/v2)
 * Radio : SX1276 / SX1278 (433/868/915 MHz — match your region)
 *
 * Libraries required (install via Arduino Library Manager):
 *   • Heltec ESP32 Dev-Boards  (by Heltec Automation) — or Arduino-LoRa
 *   • AESLib  (by kakopappa) — AES-128-GCM authenticated encryption
 *
 * Alternatively, if using the Heltec board:
 *   • Install "Heltec ESP32" in board manager
 *   • Install "AESLib" from Library Manager
 *
 * Secure Packet Format (binary, over LoRa air):
 *   Byte 0      : version  (0x01)
 *   Byte 1      : cmd      (command id, see CMD_* defines)
 *   Bytes 2–5   : counter  (uint32_t, big-endian, monotonically increasing)
 *   Bytes 6–N   : ciphertext  (AES-128-GCM encrypted payload)
 *   Bytes N+1…  : auth tag    (16-byte GCM tag)
 *
 *   AAD  (Additional Authenticated Data, not encrypted, covered by tag):
 *     = bytes 0..5  (version + cmd + counter)
 *
 * Key: loaded from firmware/secrets.h — NEVER hardcoded here.
 *
 * Serial output (USB): human-readable debug — no key material exposed.
 */

#include "secrets.h"         // pre-shared key — gitignored
#include <AESLib.h>          // AES-128-GCM (kakopappa/AESLib)
#include <LoRa.h>            // by Sandeep Mistry (Arduino-LoRa)
#include <EEPROM.h>

// ─── Board pin-map — adjust for your exact module ──────────────────────────
// Heltec WiFi LoRa 32 v2 pins:
#define LORA_SCK    5
#define LORA_MISO  19
#define LORA_MOSI  27
#define LORA_SS    18
#define LORA_RST   14
#define LORA_DIO0  26

// ─── LoRa radio config ──────────────────────────────────────────────────────
#define LORA_FREQ   433E6   // 433 MHz — or 868E6/915E6 to match your region
#define LORA_BW     125000  // 125 kHz bandwidth
#define LORA_SF     9       // Spreading factor (7–12). Higher = longer range, slower.
#define LORA_CR     5       // Coding rate 4/5
#define LORA_TX_POWER 17    // dBm — legal limit varies by region

// ─── Packet protocol ────────────────────────────────────────────────────────
#define PACKET_VERSION   0x01   // bump when wire format changes

// Command IDs — whitelisted on the rover
#define CMD_TELEMETRY    0x10   // uplink: rover sends GPS/sensor data
#define CMD_DRIVE        0x20   // downlink: set motor speed + steering
#define CMD_ARM          0x30   // downlink: set robotic arm pose
#define CMD_ESTOP        0xFE   // emergency stop (no payload needed)
#define CMD_PING         0x01   // keep-alive

// ─── EEPROM counter persistence ────────────────────────────────────────────
#define EEPROM_SIZE          8
#define EEPROM_COUNTER_ADDR  0   // 4 bytes for TX counter

// ─── Security ────────────────────────────────────────────────────────────────
// Nonce = [counter(4B) | 8 bytes of zeros] → 12-byte GCM nonce
// This is fine because we NEVER repeat a counter value with the same key.
#define AES_KEY_LEN     16
#define GCM_TAG_LEN     16
#define GCM_NONCE_LEN   12

// ─── Globals ────────────────────────────────────────────────────────────────
static uint32_t txCounter = 0;
static AESLib   aesLib;

// Packet payload for CMD_DRIVE
struct DrivePayload {
    int16_t speed;    // -1000..+1000 (mapped to motor PWM)
    int16_t steer;    // -1000..+1000 (negative = left)
    uint8_t flags;    // bit0 = headlights, bit1 = arm_enable, etc.
};

// ─── EEPROM helpers ─────────────────────────────────────────────────────────
void loadCounter() {
    EEPROM.begin(EEPROM_SIZE);
    uint32_t saved = 0;
    EEPROM.get(EEPROM_COUNTER_ADDR, saved);
    // Start one higher than what was last saved so a reboot
    // doesn't accidentally reuse the old counter value.
    txCounter = saved + 1;
    Serial.printf("[TX] Counter loaded from EEPROM: %u -> starting at %u\n", saved, txCounter);
}

void persistCounter(uint32_t val) {
    EEPROM.put(EEPROM_COUNTER_ADDR, val);
    EEPROM.commit();
}

// ─── Build a secure packet ──────────────────────────────────────────────────
//
// outBuf must be large enough: 6 (header) + payloadLen + 16 (tag) bytes
// Returns total packet length written into outBuf, or 0 on error.
//
size_t buildSecurePacket(
    uint8_t  cmd,
    const uint8_t *payload, size_t payloadLen,
    uint8_t  *outBuf,       size_t outBufLen
) {
    // Header (AAD): [version][cmd][counter big-endian 4B]
    uint8_t header[6];
    header[0] = PACKET_VERSION;
    header[1] = cmd;
    header[2] = (txCounter >> 24) & 0xFF;
    header[3] = (txCounter >> 16) & 0xFF;
    header[4] = (txCounter >>  8) & 0xFF;
    header[5] = (txCounter      ) & 0xFF;

    // Nonce: counter (4B) || zero-padded to 12 bytes
    uint8_t nonce[GCM_NONCE_LEN] = {0};
    nonce[0] = header[2]; nonce[1] = header[3];
    nonce[2] = header[4]; nonce[3] = header[5];
    // bytes 4..11 remain 0x00

    // Total needed: 6 header + payloadLen ciphertext + 16 tag
    size_t needed = 6 + payloadLen + GCM_TAG_LEN;
    if (outBufLen < needed) {
        Serial.println("[TX] ERROR: output buffer too small");
        return 0;
    }

    uint8_t tag[GCM_TAG_LEN];
    uint8_t ciphertext[payloadLen];   // VLA — ESP32 stack is ample for small payloads

    // AES-128-GCM encrypt
    // AESLib::gcm_encrypt(key, keyLen, iv, ivLen, aad, aadLen, plaintext, ptLen, ciphertext, tag)
    int ret = aesLib.gcm_encrypt(
        (uint8_t *)IRONCLAD_PSK, AES_KEY_LEN,
        nonce, GCM_NONCE_LEN,
        header, 6,           // AAD
        (uint8_t *)payload, payloadLen,
        ciphertext,
        tag
    );

    if (ret != 0) {
        Serial.printf("[TX] AES-GCM encrypt failed: %d\n", ret);
        return 0;
    }

    // Assemble: header | ciphertext | tag
    memcpy(outBuf,                      header,     6);
    memcpy(outBuf + 6,                  ciphertext, payloadLen);
    memcpy(outBuf + 6 + payloadLen,     tag,        GCM_TAG_LEN);

    return needed;
}

// ─── Send a packet over LoRa ────────────────────────────────────────────────
bool sendPacket(uint8_t cmd, const uint8_t *payload, size_t payloadLen) {
    uint8_t buf[128];
    size_t  pktLen = buildSecurePacket(cmd, payload, payloadLen, buf, sizeof(buf));
    if (pktLen == 0) return false;

    LoRa.beginPacket();
    LoRa.write(buf, pktLen);
    bool ok = LoRa.endPacket();

    if (ok) {
        Serial.printf("[TX] Sent cmd=0x%02X counter=%u len=%u\n", cmd, txCounter, pktLen);
        persistCounter(txCounter);   // persist BEFORE incrementing so a crash
        txCounter++;                 // doesn't reuse the persisted value
    } else {
        Serial.println("[TX] ERROR: LoRa.endPacket() failed");
    }
    return ok;
}

// ─── Convenience wrappers ────────────────────────────────────────────────────
bool sendDrive(int16_t speed, int16_t steer, uint8_t flags = 0) {
    DrivePayload pld = { speed, steer, flags };
    return sendPacket(CMD_DRIVE, (uint8_t *)&pld, sizeof(pld));
}

bool sendPing() {
    uint8_t dummy = 0x00;
    return sendPacket(CMD_PING, &dummy, 1);
}

bool sendEstop() {
    uint8_t dummy = 0xFF;
    return sendPacket(CMD_ESTOP, &dummy, 1);
}

// ─── Read joystick / control input ──────────────────────────────────────────
// The controller reads UART commands from the laptop dashboard (USB Serial)
// Format:  "D,<speed>,<steer>\n"   e.g. "D,500,-200\n"
//          "E\n"                    emergency stop
//          "P\n"                    ping

String uartBuf = "";

void processUartLine(const String &line) {
    if (line.length() == 0) return;

    if (line.startsWith("D,")) {
        // Drive command from laptop
        int comma1 = line.indexOf(',');
        int comma2 = line.indexOf(',', comma1 + 1);
        if (comma1 < 0 || comma2 < 0) {
            Serial.println("[TX] Malformed drive command from host");
            return;
        }
        int16_t speed = (int16_t)line.substring(comma1 + 1, comma2).toInt();
        int16_t steer = (int16_t)line.substring(comma2 + 1).toInt();

        // Clamp to safe range before transmitting
        speed = constrain(speed, -1000, 1000);
        steer = constrain(steer, -1000, 1000);

        sendDrive(speed, steer);

    } else if (line == "E") {
        sendEstop();

    } else if (line == "P") {
        sendPing();

    } else {
        Serial.printf("[TX] Unknown host command: %s\n", line.c_str());
    }
}

// ─── setup / loop ────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n[TX] IRONCLAD Secure LoRa Transmitter v1.0");

    // Load persisted TX counter so we never reuse a nonce
    loadCounter();

    // SPI LoRa init
    SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
    LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

    if (!LoRa.begin(LORA_FREQ)) {
        Serial.println("[TX] FATAL: LoRa init failed — check wiring");
        while (true) { delay(1000); }
    }

    LoRa.setSignalBandwidth(LORA_BW);
    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setCodingRate4(LORA_CR);
    LoRa.setTxPower(LORA_TX_POWER);
    LoRa.enableCrc();   // LoRa CRC (protects against bit-flip in transmission)

    Serial.printf("[TX] LoRa ready — %.0f MHz, SF%d, BW%d\n",
                  (double)LORA_FREQ, LORA_SF, LORA_BW/1000);

    // Send an initial ping so rover knows we're alive
    sendPing();
}

static unsigned long lastPingMs = 0;
#define PING_INTERVAL_MS  3000   // send keep-alive every 3 seconds

void loop() {
    // 1. Read commands arriving from the laptop over USB Serial
    while (Serial.available()) {
        char c = Serial.read();
        if (c == '\n') {
            uartBuf.trim();
            processUartLine(uartBuf);
            uartBuf = "";
        } else {
            uartBuf += c;
        }
    }

    // 2. Periodic keep-alive ping
    if (millis() - lastPingMs >= PING_INTERVAL_MS) {
        lastPingMs = millis();
        sendPing();
    }

    // 3. Receive any telemetry coming back from the rover
    //    (ACK or sensor uplink) — decode and forward to laptop over Serial
    int pktSize = LoRa.parsePacket();
    if (pktSize > 0) {
        // Simply forward raw bytes to laptop as hex — laptop-side
        // loraSerial.ts can add decryption if needed.
        // For a uni-directional secure control link this section is
        // a stub; add symmetric decryption here if you need uplink security.
        Serial.printf("[TX] Received %d bytes from rover (RSSI %d)\n",
                      pktSize, LoRa.packetRssi());
    }
}
