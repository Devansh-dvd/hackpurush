/**
 * loraSerial.ts — Web Serial LoRa Receiver Service
 * ==================================================
 * Connects directly to an ESP32 LoRa receiver plugged into the laptop via USB.
 * Zero internet, zero Wi-Fi, 100% offline hardware connection.
 *
 * Security additions (non-breaking):
 *  - processLine() now first checks for the IRONCLAD binary packet prefix
 *    (hex-encoded by the ESP32 over USB Serial in format "PKT:<hex>\n").
 *  - If a secure frame is detected, it is validated using the Web Crypto API
 *    (AES-128-GCM) and rejected with a console reason if invalid.
 *  - Falls back gracefully to legacy JSON / CSV parsing for development
 *    (plaintext mode).
 *
 * KEY LOADING:
 *  The browser loads the AES-128 key from  VITE_IRONCLAD_PSK  (hex string)
 *  set in  .env.local  (gitignored).  If the env-var is absent, secure-frame
 *  validation is skipped and only the legacy parsers run (development mode).
 *
 *  echo "VITE_IRONCLAD_PSK=<32-hex-chars>" > .env.local
 *  Use the hex printed by:  python scripts/gen_key.py
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export interface LoRaTelemetryPacket {
    timestamp?: string;
    lat?: number;
    lon?: number;
    alt?: string | number;
    heading?: number;
    speed?: string | number;
    rssi?: number;
    level?: "CLEAR" | "WATCH" | "ALERT" | "FIRE";
    score?: number;
    target?: string;
    targetConf?: number;
    motion?: number;
    battery?: number;
    arm?: {
        joints?: Record<string, { angle: number }>;
    };
    raw?: string;
    // Security metadata (not persisted)
    _secure?: boolean;   // true = arrived via authenticated AES-GCM path
}

export type SerialStatus =
    | "DISCONNECTED"
    | "CONNECTING"
    | "CONNECTED"
    | "ERROR"
    | "NOT_SUPPORTED";

// ─── Protocol constants (mirror firmware) ────────────────────────────────────
const PACKET_VERSION    = 0x01;
const GCM_TAG_BITS      = 128;   // 16 bytes × 8
const GCM_NONCE_LEN     = 12;


// Whitelisted commands that carry telemetry toward the browser
const TELEMETRY_CMD  = 0x10;   // CMD_TELEMETRY from rover

// ─── Load PSK from VITE env-var (set in .env.local, gitignored) ──────────────
async function loadPsk(): Promise<CryptoKey | null> {
    const hexKey = (import.meta as any).env?.VITE_IRONCLAD_PSK as string | undefined;
    if (!hexKey || hexKey.length !== 32) {
        // Not configured — run in legacy plaintext mode
        return null;
    }
    try {
        const raw = hexKey.match(/.{2}/g)!.map((h) => parseInt(h, 16));
        return await crypto.subtle.importKey(
            "raw",
            new Uint8Array(raw),
            { name: "AES-GCM" },
            false,
            ["decrypt"]
        );
    } catch (err) {
        console.warn("[LoRa] Failed to import PSK:", err);
        return null;
    }
}

// ─── AES-128-GCM decode a secure frame ───────────────────────────────────────
//
// Wire format (binary, hex-encoded by ESP32 as "PKT:<hex>\n"):
//   byte 0      : version
//   byte 1      : cmd
//   bytes 2–5   : counter big-endian
//   bytes 6..N  : ciphertext
//   bytes N+1…  : 16-byte GCM tag
//
// Returns decrypted payload bytes, or null if verification fails.
async function decodeSecureFrame(
    pkt: Uint8Array,
    psk: CryptoKey
): Promise<{ cmd: number; counter: number; payload: Uint8Array } | null> {
    // Minimum: 6 header + 0 payload + 16 tag = 22 bytes
    if (pkt.length < 22) {
        console.warn("[LoRa] REJECT: packet too short", pkt.length);
        return null;
    }

    const version = pkt[0];
    const cmd     = pkt[1];
    const counter = ((pkt[2] << 24) | (pkt[3] << 16) | (pkt[4] << 8) | pkt[5]) >>> 0;

    if (version !== PACKET_VERSION) {
        console.warn(`[LoRa] REJECT: wrong version 0x${version.toString(16)}`);
        return null;
    }

    // Nonce: counter (4 big-endian bytes) || 8 zero bytes
    const nonce = new Uint8Array(GCM_NONCE_LEN);
    nonce[0] = pkt[2]; nonce[1] = pkt[3]; nonce[2] = pkt[4]; nonce[3] = pkt[5];

    // AAD = header (bytes 0..5)
    const aad = pkt.slice(0, 6);

    // ct_and_tag = bytes 6 .. end (ciphertext + 16-byte GCM tag appended by Web Crypto)
    const ctAndTag = pkt.slice(6);

    try {
        const plainBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: GCM_TAG_BITS },
            psk,
            ctAndTag
        );

        return { cmd, counter, payload: new Uint8Array(plainBuf) };
    } catch {
        // AES-GCM will throw on tag mismatch — forged or tampered
        console.warn("[LoRa] REJECT: authentication failure (forged or tampered packet)");
        return null;
    }
}

// ─── Convert a decrypted telemetry payload to LoRaTelemetryPacket ─────────────
function parseTelemetryPayload(payload: Uint8Array): LoRaTelemetryPacket | null {
    try {
        const text = new TextDecoder().decode(payload);
        if (text.startsWith("{")) {
            const parsed = JSON.parse(text);
            return {
                timestamp: parsed.t || new Date().toISOString(),
                lat:       parsed.lat,
                lon:       parsed.lon,
                alt:       parsed.alt,
                heading:   parsed.hdg,
                speed:     parsed.spd,
                rssi:      parsed.rssi,
                level:     parsed.level || "CLEAR",
                score:     parsed.score,
                battery:   parsed.bat,
                arm:       parsed.arm,
                _secure:   true,
            };
        }
    } catch { /* fall through */ }
    return null;
}

// ─── Replay protection (browser side — lightweight) ───────────────────────────
// We only keep the last accepted counter in memory; the ESP32 rover is the
// authoritative replay guardian.  This catches duplicates within a session.
let browserLastCounter = 0;

function checkAndAdvanceCounter(counter: number): boolean {
    if (counter <= browserLastCounter) {
        console.warn(`[LoRa] REJECT: replay (browser) — counter ${counter} <= ${browserLastCounter}`);
        return false;
    }
    browserLastCounter = counter;
    return true;
}

// ─── Main service class ───────────────────────────────────────────────────────
class LoRaSerialService {
    private port: any = null;
    private reader: any = null;
    private keepReading = false;
    private status: SerialStatus = "DISCONNECTED";
    private statusListeners: Array<(status: SerialStatus, msg?: string) => void> = [];
    private dataListeners: Array<(data: LoRaTelemetryPacket) => void> = [];
    private psk: CryptoKey | null = null;   // loaded on first connect

    public isSupported(): boolean {
        return typeof navigator !== "undefined" && "serial" in navigator;
    }

    public getStatus(): SerialStatus {
        return this.status;
    }

    public onStatusChange(callback: (status: SerialStatus, msg?: string) => void) {
        this.statusListeners.push(callback);
        return () => {
            this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
        };
    }

    public onData(callback: (data: LoRaTelemetryPacket) => void) {
        this.dataListeners.push(callback);
        return () => {
            this.dataListeners = this.dataListeners.filter(cb => cb !== callback);
        };
    }

    private updateStatus(status: SerialStatus, msg?: string) {
        this.status = status;
        this.statusListeners.forEach(cb => cb(status, msg));
    }

    public async connect(baudRate = 115200): Promise<boolean> {
        if (!this.isSupported()) {
            this.updateStatus("NOT_SUPPORTED",
                "Web Serial API not supported. Use Chrome or Edge.");
            return false;
        }

        try {
            // Load the PSK once — prints a warning if not configured
            this.psk = await loadPsk();
            if (this.psk) {
                console.info("[LoRa] AES-128-GCM key loaded — secure mode active");
            } else {
                console.warn(
                    "[LoRa] VITE_IRONCLAD_PSK not set — " +
                    "running in legacy plaintext mode (dev only)"
                );
            }

            this.updateStatus("CONNECTING");
            this.port = await (navigator as any).serial.requestPort();
            await this.port.open({ baudRate });

            this.keepReading = true;
            this.updateStatus("CONNECTED", `Connected at ${baudRate} baud`);
            this.readLoop();
            return true;
        } catch (err: any) {
            console.error("LoRa Serial connection error:", err);
            this.updateStatus("ERROR", err?.message || "Failed to open serial port");
            return false;
        }
    }

    private async readLoop() {
        let buffer = "";

        try {
            while (this.port && this.port.readable && this.keepReading) {
                const textDecoder = new TextDecoderStream();
                const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
                this.reader = textDecoder.readable.getReader();

                try {
                    while (true) {
                        const { value, done } = await this.reader.read();
                        if (done) break;
                        if (value) {
                            buffer += value;
                            const lines = buffer.split("\n");
                            buffer = lines.pop() || "";

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed) {
                                    await this.processLine(trimmed);
                                }
                            }
                        }
                    }
                } finally {
                    this.reader.releaseLock();
                }
                await readableStreamClosed.catch(() => {});
            }
        } catch (err) {
            console.warn("Serial read loop terminated:", err);
        } finally {
            this.disconnect();
        }
    }

    // ─── processLine: secure path first, then legacy fallback ─────────────────
    private async processLine(line: string) {
        try {
            // ── SECURE FRAME from ESP32 (format: "PKT:<lowercase-hex>") ──────
            // The ESP32 firmware sends received-and-forwarded LoRa frames as
            //   PKT:0102000003e8<ciphertext><tag>\n
            // This lets the browser also validate the AES-GCM tag.
            if (line.startsWith("PKT:") && this.psk) {
                const hexStr = line.slice(4);
                const raw    = new Uint8Array(
                    hexStr.match(/.{2}/g)!.map(h => parseInt(h, 16))
                );

                const decoded = await decodeSecureFrame(raw, this.psk);
                if (!decoded) {
                    // rejection already logged inside decodeSecureFrame
                    return;
                }

                // Browser-side replay check
                if (!checkAndAdvanceCounter(decoded.counter)) return;

                // Only TELEMETRY_CMD carries sensor data toward the dashboard
                if (decoded.cmd !== TELEMETRY_CMD) return;

                const packet = parseTelemetryPayload(decoded.payload);
                if (packet) {
                    this.dispatchData(packet);
                } else {
                    console.warn("[LoRa] REJECT: could not parse telemetry payload");
                }
                return;
            }

            // ── LEGACY: plaintext JSON ─────────────────────────────────────────
            if (line.startsWith("{") && line.endsWith("}")) {
                const parsed = JSON.parse(line);
                const packet: LoRaTelemetryPacket = {
                    timestamp:  parsed.t || new Date().toISOString(),
                    lat:        parsed.lat || parsed.gps?.lat,
                    lon:        parsed.lon || parsed.gps?.lon,
                    alt:        parsed.alt || (parsed.gps?.alt ? `${parsed.gps.alt} m` : undefined),
                    heading:    parsed.heading || parsed.hdg || parsed.gps?.hdg,
                    speed:      parsed.speed,
                    rssi:       parsed.rssi !== undefined ? parsed.rssi : (parsed.lora?.rssi ?? -72),
                    level:      parsed.level || "CLEAR",
                    score:      parsed.score || 0.05,
                    target:     parsed.target || (parsed.vision?.dets?.[0]?.[0]),
                    targetConf: parsed.targetConf || (parsed.vision?.dets?.[0]?.[1]),
                    motion:     parsed.motion ?? parsed.vision?.motion,
                    battery:    parsed.battery,
                    arm:        parsed.arm,
                    raw:        line,
                    _secure:    false,
                };
                this.dispatchData(packet);
                return;
            }

            // ── LEGACY: CSV ────────────────────────────────────────────────────
            if (line.startsWith("LORA,") || line.startsWith("TELEMETRY,")) {
                const parts = line.split(",");
                const packet: LoRaTelemetryPacket = {
                    lat:     parseFloat(parts[1]) || undefined,
                    lon:     parseFloat(parts[2]) || undefined,
                    heading: parseFloat(parts[3]) || undefined,
                    score:   parseFloat(parts[4]) || 0,
                    level:   (parts[5] as any)    || "CLEAR",
                    rssi:    parseInt(parts[6])    || -75,
                    raw:     line,
                    _secure: false,
                };
                this.dispatchData(packet);
                return;
            }

            // Raw line (debug output from firmware — not dispatched as data)
        } catch (err) {
            console.warn("Error parsing serial line:", line, err);
        }
    }

    private dispatchData(packet: LoRaTelemetryPacket) {
        // Cache to localStorage for offline persistence
        try {
            localStorage.setItem("ironclad_last_telemetry", JSON.stringify(packet));
        } catch (_) {}

        this.dataListeners.forEach(cb => cb(packet));
    }

    public async disconnect() {
        this.keepReading = false;
        if (this.reader) {
            try { await this.reader.cancel(); } catch (_) {}
            this.reader = null;
        }
        if (this.port) {
            try { await this.port.close(); } catch (_) {}
            this.port = null;
        }
        this.updateStatus("DISCONNECTED");
    }

    public getLastSavedTelemetry(): LoRaTelemetryPacket | null {
        try {
            const raw = localStorage.getItem("ironclad_last_telemetry");
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * sendCommand — send a secure control command to the rover.
     *
     * The browser encodes the command as "PKT_TX:<cmd>,<speed>,<steer>\n"
     * over USB Serial to the TX ESP32, which then builds and transmits
     * the AES-128-GCM encrypted packet over the air.
     *
     * The TX ESP32 firmware (ironclad_tx.ino) reads this format.
     */
    public async sendDrive(speed: number, steer: number): Promise<boolean> {
        if (!this.port || !this.port.writable) return false;

        // Clamp on browser side too (defense in depth)
        const s = Math.max(-1000, Math.min(1000, Math.round(speed)));
        const t = Math.max(-1000, Math.min(1000, Math.round(steer)));

        const line = `D,${s},${t}\n`;
        try {
            const writer = this.port.writable.getWriter();
            await writer.write(new TextEncoder().encode(line));
            writer.releaseLock();
            return true;
        } catch (err) {
            console.error("[LoRa] sendDrive error:", err);
            return false;
        }
    }

    public async sendEstop(): Promise<boolean> {
        if (!this.port || !this.port.writable) return false;
        try {
            const writer = this.port.writable.getWriter();
            await writer.write(new TextEncoder().encode("E\n"));
            writer.releaseLock();
            return true;
        } catch (err) {
            console.error("[LoRa] sendEstop error:", err);
            return false;
        }
    }
}

export const loraSerialService = new LoRaSerialService();
