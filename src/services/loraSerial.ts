/**
 * Web Serial LoRa Receiver Service
 * Connects directly to an ESP32 LoRa receiver plugged into the laptop via USB (COM Port).
 * Zero internet, zero Wi-Fi, 100% offline hardware connection.
 */

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
}

export type SerialStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR" | "NOT_SUPPORTED";

class LoRaSerialService {
    private port: any = null;
    private reader: any = null;
    private keepReading = false;
    private status: SerialStatus = "DISCONNECTED";
    private statusListeners: Array<(status: SerialStatus, msg?: string) => void> = [];
    private dataListeners: Array<(data: LoRaTelemetryPacket) => void> = [];

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
            this.updateStatus("NOT_SUPPORTED", "Web Serial API not supported in this browser. Use Chrome or Edge.");
            return false;
        }

        try {
            this.updateStatus("CONNECTING");
            // Prompt user to select their ESP32 COM port
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
                            buffer = lines.pop() || ""; // Keep incomplete line in buffer

                            for (const line of lines) {
                                const trimmed = line.trim();
                                if (trimmed) {
                                    this.processLine(trimmed);
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

    private processLine(line: string) {
        try {
            // Check if packet is JSON
            if (line.startsWith("{") && line.endsWith("}")) {
                const parsed = JSON.parse(line);
                const packet: LoRaTelemetryPacket = {
                    timestamp: parsed.t || new Date().toISOString(),
                    lat: parsed.lat || parsed.gps?.lat,
                    lon: parsed.lon || parsed.gps?.lon,
                    alt: parsed.alt || (parsed.gps?.alt ? `${parsed.gps.alt} m` : undefined),
                    heading: parsed.heading || parsed.hdg || parsed.gps?.hdg,
                    speed: parsed.speed,
                    rssi: parsed.rssi !== undefined ? parsed.rssi : (parsed.lora?.rssi ?? -72),
                    level: parsed.level || "CLEAR",
                    score: parsed.score || 0.05,
                    target: parsed.target || (parsed.vision?.dets?.[0]?.[0]),
                    targetConf: parsed.targetConf || (parsed.vision?.dets?.[0]?.[1]),
                    motion: parsed.motion ?? parsed.vision?.motion,
                    battery: parsed.battery,
                    arm: parsed.arm,
                    raw: line,
                };
                this.dispatchData(packet);
                return;
            }

            // Fallback: CSV formatted packet (e.g., LORA,lat,lon,heading,score,threat,rssi)
            if (line.startsWith("LORA,") || line.startsWith("TELEMETRY,")) {
                const parts = line.split(",");
                const packet: LoRaTelemetryPacket = {
                    lat: parseFloat(parts[1]) || undefined,
                    lon: parseFloat(parts[2]) || undefined,
                    heading: parseFloat(parts[3]) || undefined,
                    score: parseFloat(parts[4]) || 0,
                    level: (parts[5] as any) || "CLEAR",
                    rssi: parseInt(parts[6]) || -75,
                    raw: line,
                };
                this.dispatchData(packet);
                return;
            }

            // Raw line packet
            this.dispatchData({ raw: line });
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
            try {
                await this.reader.cancel();
            } catch (_) {}
            this.reader = null;
        }
        if (this.port) {
            try {
                await this.port.close();
            } catch (_) {}
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
}

export const loraSerialService = new LoRaSerialService();
