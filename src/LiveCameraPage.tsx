import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    Camera,
    Compass,
    Shield,
    Crosshair,
    Navigation,
    Activity,
    Radio,
    Zap,
    Cpu,
    Wifi,
    Terminal,
    Eye,
    EyeOff
} from "lucide-react";
import TacticalWorldMap from "./components/camera/TacticalWorldMap";
import { loraSerialService, LoRaTelemetryPacket, SerialStatus } from "./services/loraSerial";

export default function LiveCameraPage() {
    const [spectrumMode, setSpectrumMode] = useState<"STANDARD" | "NIGHT" | "THERMAL">("STANDARD");
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsMessage, setGpsMessage] = useState<string>("DEFAULT PERIMETER COORDINATES");
    
    // 3-Way Link Source Mode: Live Wi-Fi direct, LoRa ESP32 USB Serial, or 100% Offline Simulation
    const [telemetrySource, setTelemetrySource] = useState<"WIFI" | "LORA" | "SIMULATION">(() => {
        return (localStorage.getItem("ironclad_source_mode") as any) || "WIFI";
    });

    // Live stream state from Raspberry Pi
    const [streamIp, setStreamIp] = useState("172.20.10.3:5000");
    const [streamOnline, setStreamOnline] = useState(true);
    const [streamFps, setStreamFps] = useState<number | string>(6.1);
    const [aiDetections, setAiDetections] = useState<Array<[string, number]>>([]);
    const [threatLevel, setThreatLevel] = useState<string>("CLEAR");
    const [threatScore, setThreatScore] = useState<number>(0.048);
    const [motionLevel, setMotionLevel] = useState<number>(0.15);
    const [loraSignal, setLoraSignal] = useState<number | null>(-72);
    const [showVideoInOffline, setShowVideoInOffline] = useState(false);

    // Web Serial LoRa ESP32 state
    const [serialStatus, setSerialStatus] = useState<SerialStatus>("DISCONNECTED");
    const [serialMessage, setSerialMessage] = useState<string>("");
    const [loraPacketCount, setLoraPacketCount] = useState<number>(0);
    const [lastRawPacket, setLastRawPacket] = useState<string>("");

    // Rover GPS position & navigation state (with live device location support)
    const [roverData, setRoverData] = useState({
        lat: 28.61394,
        lon: 77.20902,
        alt: "216 m ASL",
        heading: 42,
        sector: "SECTOR-04 BRAVO",
        waypoint: "WP-02 / 5",
        distanceToWp: "6.2 m",
        speed: "1.2 m/s",
        hdop: "0.88",
        sats: 12,
        isDeviceGps: false,
    });

    // Save source mode choice
    const changeSourceMode = (mode: "WIFI" | "LORA" | "SIMULATION") => {
        setTelemetrySource(mode);
        try {
            localStorage.setItem("ironclad_source_mode", mode);
        } catch (_) {}
    };

    // Detect browser/device current geolocation
    const fetchCurrentLocation = () => {
        if (!("geolocation" in navigator)) {
            setGpsMessage("GEOLOCATION NOT SUPPORTED BY BROWSER");
            return;
        }

        setGpsLoading(true);
        setGpsMessage("ACQUIRING REAL-TIME GPS FIX...");

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, altitude, heading, accuracy } = pos.coords;
                const roundedLat = Number(latitude.toFixed(5));
                const roundedLon = Number(longitude.toFixed(5));

                setRoverData((prev) => ({
                    ...prev,
                    lat: roundedLat,
                    lon: roundedLon,
                    alt: altitude ? `${Math.round(altitude)} m ASL` : prev.alt,
                    heading: heading ? Math.round(heading) : prev.heading,
                    hdop: accuracy ? (accuracy / 10).toFixed(2) : "0.50",
                    isDeviceGps: true,
                    sector: `CURRENT LOCATION [±${Math.round(accuracy || 5)}m]`,
                }));
                setGpsLoading(false);
                setGpsMessage(`LIVE GPS LOCKED (ACCURACY ±${Math.round(accuracy || 5)}m)`);
            },
            (err) => {
                console.warn("Geolocation access denied or unavailable:", err);
                setGpsLoading(false);
                setGpsMessage("GPS ACCESS DISMISSED — USING PERIMETER BASE");
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0,
            }
        );
    };

    // Auto-attempt geolocation on mount
    useEffect(() => {
        fetchCurrentLocation();
    }, []);

    // 1. LoRa Web Serial Subscriptions
    useEffect(() => {
        const unsubStatus = loraSerialService.onStatusChange((status, msg) => {
            setSerialStatus(status);
            if (msg) setSerialMessage(msg);
        });

        const unsubData = loraSerialService.onData((packet: LoRaTelemetryPacket) => {
            setLoraPacketCount(c => c + 1);
            if (packet.raw) setLastRawPacket(packet.raw);
            if (packet.rssi !== undefined) setLoraSignal(packet.rssi);
            if (packet.level) setThreatLevel(packet.level);
            if (packet.score !== undefined) setThreatScore(packet.score);
            if (packet.target) {
                setAiDetections([[packet.target, packet.targetConf ?? 0.88]]);
            }
            if (packet.motion !== undefined) setMotionLevel(packet.motion);
            if (packet.lat && packet.lon) {
                setRoverData(prev => ({
                    ...prev,
                    lat: packet.lat!,
                    lon: packet.lon!,
                    heading: packet.heading ?? prev.heading,
                    speed: packet.speed !== undefined ? `${packet.speed} m/s` : prev.speed,
                }));
            }
        });

        return () => {
            unsubStatus();
            unsubData();
        };
    }, []);

    // 2. Wi-Fi Polling Loop (Only active when in WIFI mode)
    useEffect(() => {
        if (telemetrySource !== "WIFI") return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch("/rover-api/state");
                if (res.ok) {
                    const data = await res.json();
                    if (data.vision) {
                        setStreamFps(data.vision.fps || 6.1);
                        setAiDetections(data.vision.dets || []);
                        setMotionLevel(data.vision.motion ?? 0.15);
                    }
                    if (data.level) setThreatLevel(data.level);
                    if (data.score !== undefined) setThreatScore(data.score);
                    if (data.lora?.rssi !== undefined) setLoraSignal(data.lora.rssi);
                    if (data.gps?.lat && data.gps?.lon) {
                        setRoverData((prev) => ({
                            ...prev,
                            lat: data.gps.lat,
                            lon: data.gps.lon,
                            sats: data.gps.sats || prev.sats,
                        }));
                    }
                    setStreamOnline(true);
                } else {
                    setStreamOnline(false);
                }
            } catch (err) {
                setStreamOnline(false);
            }
        }, 1200);

        return () => clearInterval(interval);
    }, [telemetrySource]);

    // 3. Offline Simulation Loop (Only active when in SIMULATION mode)
    useEffect(() => {
        if (telemetrySource !== "SIMULATION") return;

        let step = 0;
        const interval = setInterval(() => {
            step++;
            const t = step * 0.15;
            // Simulated circular perimeter patrol coordinates around base
            const simLat = Number((28.61394 + Math.sin(t) * 0.0008).toFixed(5));
            const simLon = Number((77.20902 + Math.cos(t) * 0.0009).toFixed(5));
            const simHeading = Math.round((Math.sin(t) * 180 + 180) % 360);
            const simRssi = -70 - Math.round(Math.abs(Math.sin(t * 0.5) * 15));

            setRoverData(prev => ({
                ...prev,
                lat: simLat,
                lon: simLon,
                heading: simHeading,
                speed: "1.4 m/s",
                distanceToWp: `${(4.5 + Math.sin(t) * 2.5).toFixed(1)} m`,
            }));
            setLoraSignal(simRssi);
            setLoraPacketCount(c => c + 1);

            // Periodic threat events
            if (step % 20 < 6) {
                setThreatLevel("WATCH");
                setThreatScore(0.48);
                setAiDetections([["person", 0.91]]);
                setMotionLevel(0.85);
            } else {
                setThreatLevel("CLEAR");
                setThreatScore(0.06);
                setAiDetections([]);
                setMotionLevel(0.12);
            }
        }, 1500);

        return () => clearInterval(interval);
    }, [telemetrySource]);

    // Connect/Disconnect ESP32 Serial
    const handleConnectSerial = async () => {
        if (serialStatus === "CONNECTED") {
            await loraSerialService.disconnect();
        } else {
            await loraSerialService.connect(115200);
        }
    };

    // CSS filter based on selected spectrum
    const getSpectrumFilter = () => {
        switch (spectrumMode) {
            case "NIGHT":
                return "brightness(1.15) contrast(1.4) hue-rotate(65deg) saturate(1.8)";
            case "THERMAL":
                return "invert(0.85) hue-rotate(180deg) saturate(2.4) contrast(1.3)";
            default:
                return "none";
        }
    };

    return (
        <div
            style={{
                background: "#070707",
                color: "#e8e8e8",
                minHeight: "100vh",
                fontFamily: "'Space Grotesk', sans-serif",
            }}
            className="flex flex-col"
        >
            {/* Top Navigation */}
            <header
                className="flex items-center justify-between px-6 py-4 border-b border-[#222]"
                style={{ background: "#0a0a0a" }}
            >
                <div className="flex items-center gap-4">
                    <Link
                        to="/"
                        className="flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-bold text-white border border-[#333] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition cursor-pointer"
                    >
                        <ArrowLeft size={14} />
                        BACK TO DASHBOARD
                    </Link>

                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#C6FF3D] animate-pulse" />
                        <span className="font-mono font-bold text-sm tracking-wide text-white">
                            ABSR SENTRY OPTICAL PAYLOAD &amp; TACTICAL MAP
                        </span>
                        <span className="hidden sm:inline text-[10px] font-mono px-2 py-0.5 bg-[#161616] border border-[#333] text-[#C6FF3D]">
                            SECTOR-04 BRAVO
                        </span>
                    </div>
                </div>

                {/* Right side connection badge */}
                <div className="flex items-center gap-3 font-mono text-xs">
                    <div className="flex items-center gap-2 px-3 py-1 bg-[#111] border border-[#2a2a2a]">
                        <span className={`w-2 h-2 rounded-full ${
                            telemetrySource === "WIFI"
                                ? (streamOnline ? "bg-[#22c55e] animate-ping" : "bg-[#ef4444]")
                                : telemetrySource === "LORA"
                                ? (serialStatus === "CONNECTED" ? "bg-[#3b82f6] animate-ping" : "bg-[#f59e0b]")
                                : "bg-[#C6FF3D] animate-ping"
                        }`} />
                        <span className="text-[11px] font-bold text-white">
                            {telemetrySource === "WIFI"
                                ? (streamOnline ? "PI WI-FI ACTIVE" : "PI UNREACHABLE")
                                : telemetrySource === "LORA"
                                ? (serialStatus === "CONNECTED" ? "ESP32 LORA CONNECTED" : "LORA STANDBY")
                                : "OFFLINE SIM ACTIVE"}
                        </span>
                        <span className="text-[10px] text-[#666]">
                            [{telemetrySource === "WIFI" ? streamIp : telemetrySource === "LORA" ? "USB 115200" : "AUTONOMOUS"}]
                        </span>
                    </div>
                </div>
            </header>

            {/* TELEMETRY SOURCE & OFFLINE LINK MODE BAR */}
            <div className="flex items-center justify-between px-6 py-2.5 bg-[#0e0e0e] border-b border-[#222] font-mono text-xs flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-[#888] text-[11px] font-bold flex items-center gap-1.5">
                        <Cpu size={13} className="text-[#C6FF3D]" />
                        TELEMETRY SOURCE:
                    </span>
                    <div className="flex border border-[#333] bg-[#070707]">
                        <button
                            onClick={() => changeSourceMode("WIFI")}
                            className={`px-3 py-1 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                                telemetrySource === "WIFI"
                                    ? "bg-[#22c55e] text-black font-extrabold"
                                    : "text-[#888] hover:text-white"
                            }`}
                        >
                            <Wifi size={12} />
                            WI-FI DIRECT (PI)
                        </button>
                        <button
                            onClick={() => changeSourceMode("LORA")}
                            className={`px-3 py-1 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                                telemetrySource === "LORA"
                                    ? "bg-[#3b82f6] text-white font-extrabold"
                                    : "text-[#888] hover:text-white"
                            }`}
                        >
                            <Radio size={12} />
                            LORA (ESP32 USB)
                        </button>
                        <button
                            onClick={() => changeSourceMode("SIMULATION")}
                            className={`px-3 py-1 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                                telemetrySource === "SIMULATION"
                                    ? "bg-[#C6FF3D] text-black font-extrabold"
                                    : "text-[#888] hover:text-white"
                            }`}
                        >
                            <Shield size={12} />
                            OFFLINE SIMULATION
                        </button>
                    </div>
                </div>

                {/* LoRa Connect Trigger or Info */}
                <div className="flex items-center gap-3">
                    {telemetrySource === "LORA" && (
                        <button
                            onClick={handleConnectSerial}
                            className={`px-3 py-1 text-[11px] font-bold flex items-center gap-1.5 border transition cursor-pointer ${
                                serialStatus === "CONNECTED"
                                    ? "border-[#ef4444] bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444] hover:text-black"
                                    : "border-[#3b82f6] bg-[#3b82f6]/20 text-[#60a5fa] hover:bg-[#3b82f6] hover:text-white"
                            }`}
                        >
                            <Zap size={12} />
                            {serialStatus === "CONNECTED" ? "DISCONNECT ESP32" : "CONNECT ESP32 (USB)"}
                        </button>
                    )}

                    <span className="text-[10px] text-[#666]">
                        {telemetrySource === "LORA" 
                            ? `RX: ${loraPacketCount} PKTS • ${loraSignal ?? -72} dBm • AES-128`
                            : telemetrySource === "SIMULATION"
                            ? "100% OFFLINE • ZERO HARDWARE NEEDED"
                            : "MJPEG 6 FPS STREAM • 172.20.10.3:5000"}
                    </span>
                </div>
            </div>

            {/* Main Content Layout */}
            <main className="flex-1 p-6 max-w-[1700px] w-full mx-auto flex flex-col gap-6">
                {/* TOP ROW: CAMERA / LORA CARRIER (LEFT) + TACTICAL MAP (RIGHT) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* LEFT CONTAINER: DUAL MODE (LIVE VIDEO OR OFFLINE LORA CARRIER HUD) */}
                    <div className="flex flex-col border border-[#2a2a2a] bg-[#090909]">
                        {/* Header bar */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] bg-[#0d0d0d] font-mono text-xs">
                            <div className="flex items-center gap-2 text-white">
                                {telemetrySource === "WIFI" || showVideoInOffline ? (
                                    <>
                                        <Camera size={14} className="text-[#C6FF3D]" />
                                        <span className="font-bold">CAM-01 [FRONT APEX]</span>
                                        <span className="text-[#666]">•</span>
                                        <span className="text-[#888]">OPTICAL WEBCAM FEED</span>
                                    </>
                                ) : (
                                    <>
                                        <Radio size={14} className="text-[#3b82f6]" />
                                        <span className="font-bold">RF-01 [LORA TELEMETRY CARRIER]</span>
                                        <span className="text-[#666]">•</span>
                                        <span className="text-[#888]">868.35 MHz RADIO LINK</span>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-2">
                                {/* Toggle between Video and Telemetry HUD */}
                                <button
                                    onClick={() => setShowVideoInOffline(v => !v)}
                                    className="px-2 py-0.5 border border-[#333] hover:border-[#C6FF3D] bg-[#141414] text-[10px] font-bold text-[#888] hover:text-[#C6FF3D] flex items-center gap-1 transition cursor-pointer"
                                    title="Toggle between Live Video Feed and Tactical Telemetry Console"
                                >
                                    {showVideoInOffline ? <EyeOff size={11} /> : <Eye size={11} />}
                                    {showVideoInOffline ? "SHOW LORA HUD" : "SHOW OPTICAL"}
                                </button>

                                <span className={`text-[11px] px-2 py-0.5 border font-bold flex items-center gap-1.5 ${
                                    telemetrySource === "WIFI"
                                        ? (streamOnline ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]" : "border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]")
                                        : telemetrySource === "LORA"
                                        ? (serialStatus === "CONNECTED" ? "border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#60a5fa]" : "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]")
                                        : "border-[#C6FF3D]/40 bg-[#C6FF3D]/10 text-[#C6FF3D]"
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                        telemetrySource === "WIFI" && streamOnline ? "bg-[#22c55e] animate-pulse" :
                                        telemetrySource === "LORA" && serialStatus === "CONNECTED" ? "bg-[#3b82f6] animate-pulse" : "bg-[#C6FF3D] animate-pulse"
                                    }`} />
                                    {telemetrySource === "WIFI"
                                        ? (streamOnline ? `LIVE • ${streamFps} FPS` : "STREAM OFFLINE")
                                        : telemetrySource === "LORA"
                                        ? `LORA • ${loraSignal ?? -72} dBm`
                                        : "SIMULATION • RUNNING"}
                                </span>
                            </div>
                        </div>

                        {/* Viewport Slate */}
                        <div
                            className="relative flex-1 min-h-[440px] bg-[#040404] flex items-center justify-center overflow-hidden select-none"
                            style={{
                                backgroundImage:
                                    "linear-gradient(to right, #111 1px, transparent 1px), linear-gradient(to bottom, #111 1px, transparent 1px)",
                                backgroundSize: "32px 32px",
                            }}
                        >
                            {/* CASE A: LIVE OPTICAL CAMERA STREAM (When in Wi-Fi mode or user explicitly toggled video) */}
                            {(telemetrySource === "WIFI" || showVideoInOffline) ? (
                                streamOnline ? (
                                    <img
                                        src="/rover-video"
                                        alt="Raspberry Pi Live Stream"
                                        className="w-full h-full object-cover transition-transform duration-300"
                                        style={{
                                            filter: getSpectrumFilter(),
                                            transform: `scale(${zoomLevel})`,
                                        }}
                                        onError={() => {
                                            const imgEl = document.getElementById("pi-stream-img") as HTMLImageElement;
                                            if (imgEl && imgEl.src.includes("/rover-video")) {
                                                imgEl.src = `http://${streamIp}/video`;
                                            } else {
                                                setStreamOnline(false);
                                            }
                                        }}
                                        id="pi-stream-img"
                                    />
                                ) : (
                                    /* Tactical Standby / Reconnect Screen */
                                    <div className="flex flex-col items-center justify-center text-center p-8 max-w-md z-10">
                                        <div className="w-14 h-14 rounded-full border border-[#ef4444]/30 bg-[#160b0b] flex items-center justify-center mb-3">
                                            <Camera size={22} className="text-[#ef4444]" />
                                        </div>
                                        <div className="font-mono text-xs font-bold text-[#ef4444] tracking-wider mb-1">
                                            OPTICAL CARRIER DISCONNECTED
                                        </div>
                                        <div className="font-mono text-[11px] text-[#888] mb-4">
                                            Unable to reach Raspberry Pi stream on local network at
                                            <br />
                                            <span className="text-[#C6FF3D] font-mono font-bold">http://{streamIp}/video</span>
                                        </div>

                                        <div className="flex flex-col gap-2 w-full max-w-xs">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={streamIp}
                                                    onChange={(e) => setStreamIp(e.target.value)}
                                                    placeholder="172.20.10.3:5000"
                                                    className="flex-1 bg-[#111] border border-[#333] px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-[#C6FF3D]"
                                                />
                                                <button
                                                    onClick={() => {
                                                        setStreamOnline(true);
                                                        const imgEl = document.getElementById("pi-stream-img") as HTMLImageElement;
                                                        if (imgEl) imgEl.src = `/rover-video?t=${Date.now()}`;
                                                    }}
                                                    className="px-3 py-1.5 bg-[#C6FF3D] text-black font-mono font-bold text-xs hover:bg-[#d4ff66] transition cursor-pointer"
                                                >
                                                    RETRY
                                                </button>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    changeSourceMode("LORA");
                                                    setShowVideoInOffline(false);
                                                }}
                                                className="w-full py-1.5 bg-[#1b2533] border border-[#3b82f6] text-[#60a5fa] font-mono font-bold text-xs hover:bg-[#3b82f6] hover:text-white transition cursor-pointer"
                                            >
                                                SWITCH TO OFFLINE LORA LINK
                                            </button>
                                        </div>
                                    </div>
                                )
                            ) : (
                                /* CASE B: 100% OFFLINE TACTICAL LORA CARRIER & TELEMETRY CONSOLE */
                                <div className="relative w-full h-full flex flex-col items-center justify-between p-6 z-10 font-mono">
                                    {/* Top Status Banner */}
                                    <div className="w-full flex items-center justify-between text-xs border-b border-[#222] pb-3">
                                        <div className="flex items-center gap-2">
                                            <Radio size={16} className="text-[#3b82f6] animate-pulse" />
                                            <span className="font-bold text-white tracking-wider">
                                                {telemetrySource === "LORA" ? "LORA RADIO GROUND LINK" : "AUTONOMOUS PATROL SIMULATION"}
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 bg-[#16222f] border border-[#3b82f6]/40 text-[#60a5fa]">
                                                AES-128 ENCRYPTED
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-[#C6FF3D] font-bold">
                                            FREQ: 868.350 MHz (SF8 / 250kHz)
                                        </span>
                                    </div>

                                    {/* Center Animated RF Oscilloscope & Radar Pulse */}
                                    <div className="relative flex items-center justify-center my-4">
                                        {/* Expanding Radio Waves */}
                                        <div className="relative w-48 h-48 rounded-full border border-[#3b82f6]/20 flex items-center justify-center">
                                            <div className="absolute w-36 h-36 rounded-full border border-[#3b82f6]/30 animate-ping opacity-30" />
                                            <div className="absolute w-24 h-24 rounded-full border border-[#3b82f6]/40" />
                                            <div className="absolute w-12 h-12 rounded-full border border-[#C6FF3D]/50 bg-[#C6FF3D]/10 flex items-center justify-center">
                                                <Radio size={20} className="text-[#C6FF3D]" />
                                            </div>
                                        </div>

                                        {/* Overlay Metrics */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-between pointer-events-none py-1">
                                            <span className="text-[10px] text-[#60a5fa] font-bold bg-black/80 px-2 py-0.5 border border-[#3b82f6]/30">
                                                RSSI: {loraSignal ?? -72} dBm
                                            </span>
                                            <span className="text-[10px] text-[#aaa] bg-black/80 px-2 py-0.5 border border-[#333]">
                                                PACKETS: {loraPacketCount} RX
                                            </span>
                                        </div>
                                    </div>

                                    {/* Bottom Telemetry & Raw Stream Console */}
                                    <div className="w-full bg-[#0a0d10] border border-[#223344] p-3 space-y-2">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <div className="flex items-center gap-2">
                                                <Terminal size={12} className="text-[#3b82f6]" />
                                                <span className="text-[#888]">LATEST LORA PACKET:</span>
                                            </div>
                                            <span className="text-[#22c55e] font-bold">CRC OK // NO PARITY ERR</span>
                                        </div>

                                        <div className="font-mono text-[11px] text-[#60a5fa] bg-[#05080b] p-2 border border-[#1b2836] truncate">
                                            {lastRawPacket || `{"dev":"IRONCLAD","lat":${roverData.lat},"lon":${roverData.lon},"score":${threatScore.toFixed(2)},"threat":"${threatLevel}","rssi":${loraSignal ?? -72}}`}
                                        </div>

                                        {/* ESP32 Quick Connect Controls */}
                                        {telemetrySource === "LORA" && (
                                            <div className="flex items-center justify-between pt-1 text-[11px]">
                                                <span className="text-[#888]">
                                                    STATUS: <span className={serialStatus === "CONNECTED" ? "text-[#22c55e]" : "text-[#f59e0b]"}>{serialStatus}</span>
                                                    {serialMessage && ` (${serialMessage})`}
                                                </span>
                                                <button
                                                    onClick={handleConnectSerial}
                                                    className="px-2.5 py-1 bg-[#3b82f6] text-white font-bold hover:bg-[#60a5fa] transition cursor-pointer"
                                                >
                                                    {serialStatus === "CONNECTED" ? "CLOSE PORT" : "CONNECT USB PORT"}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Minimal corner brackets */}
                            <div className="absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 border-[#C6FF3D]/60 pointer-events-none" />
                            <div className="absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 border-[#C6FF3D]/60 pointer-events-none" />
                            <div className="absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 border-[#C6FF3D]/60 pointer-events-none" />
                            <div className="absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 border-[#C6FF3D]/60 pointer-events-none" />

                            {/* AI Target Detection Banner (Live from Pi vision pipeline or LoRa packet) */}
                            {aiDetections.length > 0 && (
                                <div className="absolute top-6 left-6 z-10 flex items-center gap-2 px-3 py-1.5 bg-black/85 border border-[#C6FF3D] backdrop-blur font-mono text-xs">
                                    <Crosshair size={13} className="text-[#C6FF3D] animate-spin" />
                                    <span className="font-bold text-white tracking-wide">
                                        TARGET: {aiDetections[0][0].toUpperCase()}
                                    </span>
                                    <span className="text-[#C6FF3D] font-bold">
                                        {Math.round(aiDetections[0][1] * 100)}% CONF
                                    </span>
                                    {motionLevel > 0.3 && (
                                        <span className="px-1.5 py-0.5 bg-[#ef4444]/20 border border-[#ef4444] text-[#ef4444] text-[10px] font-bold">
                                            MOTION ACTIVE
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Threat Level Badge */}
                            <div className="absolute top-6 right-6 z-10 font-mono text-xs">
                                <span className={`px-2.5 py-1 border font-bold flex items-center gap-1.5 backdrop-blur ${
                                    threatLevel === "WATCH" 
                                        ? "border-[#f59e0b] bg-black/80 text-[#f59e0b]" 
                                        : threatLevel === "ALERT" || threatLevel === "FIRE"
                                        ? "border-[#ef4444] bg-black/80 text-[#ef4444] animate-pulse"
                                        : "border-[#22c55e] bg-black/80 text-[#22c55e]"
                                }`}>
                                    <Shield size={12} />
                                    FUSION: {threatLevel} ({Math.round(threatScore * 100)}%)
                                </span>
                            </div>

                            {/* Minimal bottom HUD coordinates stamp */}
                            <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between font-mono text-[11px] text-[#aaa] z-10 bg-black/75 px-3 py-1 border border-white/10 backdrop-blur">
                                <span className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
                                    LINK: {telemetrySource === "WIFI" ? "WI-FI DIRECT" : telemetrySource === "LORA" ? "LORA USB SERIAL" : "AUTONOMOUS SIM"}
                                </span>
                                <span>SPECTRUM: {spectrumMode}</span>
                                <span>ZOOM: {zoomLevel}X</span>
                                <span>FPS: {telemetrySource === "WIFI" ? streamFps : "TELEMETRY"}</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: REAL WORLD GIS & OPENSTREETMAP */}
                    <TacticalWorldMap
                        roverLat={roverData.lat}
                        roverLon={roverData.lon}
                        roverHeading={roverData.heading}
                        sector={roverData.sector}
                        onDetectLocation={fetchCurrentLocation}
                        gpsLoading={gpsLoading}
                        isDeviceGps={roverData.isDeviceGps}
                    />
                </div>

                {/* BOTTOM ROW: TELEMETRY, SENSORY & RADAR IN CLEAN BALANCED FORMAT */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Panel 1: Live Position & GPS Details */}
                    <div className="border border-[#2a2a2a] bg-[#0c0c0c] p-5 font-mono">
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#222]">
                            <div className="flex items-center gap-2">
                                <Navigation size={15} className="text-[#C6FF3D]" />
                                <h3 className="font-bold text-white text-xs tracking-wider">
                                    ROVER NAVIGATION &amp; GPS
                                </h3>
                            </div>
                            <span
                                className="text-[10px] px-2 py-0.5 border font-bold flex items-center gap-1"
                                style={{
                                    background: roverData.isDeviceGps ? "rgba(34,197,94,0.18)" : "rgba(59,130,246,0.18)",
                                    borderColor: roverData.isDeviceGps ? "#22c55e" : "#3b82f6",
                                    color: roverData.isDeviceGps ? "#22c55e" : "#60a5fa",
                                }}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${roverData.isDeviceGps ? "bg-[#22c55e] animate-ping" : "bg-[#3b82f6]"}`} />
                                {roverData.isDeviceGps ? "DEVICE GPS LOCKED" : `${roverData.sats} SATS (FIX)`}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                            <div className="p-2.5 bg-[#121212] border border-[#222]">
                                <span className="text-[#666] text-[10px] block">LATITUDE</span>
                                <span className="text-white font-bold">{roverData.lat}° N</span>
                            </div>

                            <div className="p-2.5 bg-[#121212] border border-[#222]">
                                <span className="text-[#666] text-[10px] block">LONGITUDE</span>
                                <span className="text-white font-bold">{roverData.lon}° E</span>
                            </div>

                            <div className="p-2.5 bg-[#121212] border border-[#222]">
                                <span className="text-[#666] text-[10px] block">COMPASS HEADING</span>
                                <span className="text-[#C6FF3D] font-bold">{roverData.heading}° N-NE</span>
                            </div>

                            <div className="p-2.5 bg-[#121212] border border-[#222]">
                                <span className="text-[#666] text-[10px] block">DRIVE SPEED</span>
                                <span className="text-white font-bold">{roverData.speed}</span>
                            </div>

                            <div className="p-2.5 bg-[#121212] border border-[#222]">
                                <span className="text-[#666] block text-[10px]">ACTIVE WAYPOINT</span>
                                <span className="text-[#3b82f6] font-bold">{roverData.waypoint}</span>
                            </div>

                            <div className="p-2.5 bg-[#121212] border border-[#222]">
                                <span className="text-[#666] block text-[10px]">WP DISTANCE</span>
                                <span className="text-[#C6FF3D] font-bold">{roverData.distanceToWp}</span>
                            </div>
                        </div>

                        <div className="text-[10px] text-[#777] mt-3 pt-2 border-t border-[#1a1a1a] flex items-center justify-between">
                            <span className="truncate max-w-[220px]">STATUS: {gpsMessage}</span>
                            <span className="text-[#C6FF3D] font-bold">{roverData.hdop} HDOP</span>
                        </div>
                    </div>

                    {/* Panel 2: Surveillance Radar Sweep */}
                    <div className="border border-[#2a2a2a] bg-[#0c0c0c] p-5 font-mono flex flex-col justify-between">
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#222]">
                            <div className="flex items-center gap-2">
                                <Compass size={15} className="text-[#C6FF3D]" />
                                <h3 className="font-bold text-white text-xs tracking-wider">
                                    SURVEILLANCE RADAR (360°)
                                </h3>
                            </div>
                            <span className="text-[10px] text-[#777]">RANGE: 50m</span>
                        </div>

                        {/* Radar Graphic */}
                        <div className="flex items-center justify-center my-1">
                            <div className="relative w-36 h-36 rounded-full border border-[#262626] bg-[#080808] flex items-center justify-center overflow-hidden">
                                <div className="absolute w-28 h-28 rounded-full border border-[#1a1a1a]" />
                                <div className="absolute w-18 h-18 rounded-full border border-[#1a1a1a]" />
                                <div className="absolute w-9 h-9 rounded-full border border-[#1a1a1a]" />
                                <div className="absolute w-full h-[1px] bg-[#1a1a1a]" />
                                <div className="absolute h-full w-[1px] bg-[#1a1a1a]" />

                                {/* Rotating Sweep */}
                                <div
                                    className="absolute inset-0 origin-center pointer-events-none"
                                    style={{
                                        background:
                                            "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, rgba(198,255,61,0.22) 360deg)",
                                        animation: "spin 4s linear infinite",
                                    }}
                                />

                                {/* Rover marker */}
                                <div className="relative z-10 w-3 h-3 bg-[#C6FF3D] rounded-full shadow-[0_0_8px_#C6FF3D]" />

                                {/* Waypoint blip */}
                                <div
                                    className="absolute z-10 w-2 h-2 bg-[#3b82f6] rounded-full animate-ping"
                                    style={{ top: "28%", right: "32%" }}
                                />
                                <div
                                    className="absolute z-10 w-2 h-2 bg-[#3b82f6] rounded-full"
                                    style={{ top: "28%", right: "32%" }}
                                />
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-[#666] pt-2 border-t border-[#1a1a1a]">
                            <span>RADAR PULSE: 2400 MHz</span>
                            <span className="text-[#C6FF3D]">SECTOR SCAN CLEAR</span>
                        </div>
                    </div>

                    {/* Panel 3: Optical Controls & Link Telemetry */}
                    <div className="border border-[#2a2a2a] bg-[#0c0c0c] p-5 font-mono flex flex-col justify-between">
                        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#222]">
                            <div className="flex items-center gap-2">
                                <Activity size={15} className="text-[#C6FF3D]" />
                                <h3 className="font-bold text-white text-xs tracking-wider">
                                    OPTICAL CONTROLS &amp; LINK
                                </h3>
                            </div>
                            <span className="text-[10px] text-[#3b82f6] font-bold">
                                {loraSignal !== null ? `LORA ${loraSignal} dBm` : "LORA STANDBY"}
                            </span>
                        </div>

                        {/* Controls */}
                        <div className="space-y-3 text-xs">
                            <div>
                                <span className="text-[#777] text-[10px] block mb-1.5">SPECTRUM FILTER</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {(["STANDARD", "NIGHT", "THERMAL"] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => setSpectrumMode(mode)}
                                            className="py-1.5 text-[10px] font-bold border transition cursor-pointer"
                                            style={{
                                                borderColor: spectrumMode === mode ? "#C6FF3D" : "#2a2a2a",
                                                background: spectrumMode === mode ? "rgba(198,255,61,0.12)" : "#121212",
                                                color: spectrumMode === mode ? "#C6FF3D" : "#777",
                                            }}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <span className="text-[#777] text-[10px] block mb-1.5">OPTICAL ZOOM</span>
                                <div className="grid grid-cols-3 gap-2">
                                    {[1, 2, 4].map((z) => (
                                        <button
                                            key={z}
                                            onClick={() => setZoomLevel(z)}
                                            className="py-1.5 text-[10px] font-bold border transition cursor-pointer"
                                            style={{
                                                borderColor: zoomLevel === z ? "#C6FF3D" : "#2a2a2a",
                                                background: zoomLevel === z ? "rgba(198,255,61,0.12)" : "#121212",
                                                color: zoomLevel === z ? "#C6FF3D" : "#777",
                                            }}
                                        >
                                            {z}X
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-[#666] pt-2 border-t border-[#1a1a1a]">
                            <span>PROTOCOL: MJPEG STREAM</span>
                            <span className="text-[#22c55e]">NODE: READY</span>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="px-6 py-4 border-t border-[#1a1a1a] bg-[#050505] flex items-center justify-between text-xs font-mono text-[#666]">
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
                    <span>IRONCLAD ABSR TACTICAL SURVEILLANCE • SECTOR-04 BRAVO</span>
                </div>
                <span>TEAM CLUTCH HEROES</span>
            </footer>
        </div>
    );
}
