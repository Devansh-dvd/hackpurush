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
    WifiOff,
    Wifi
} from "lucide-react";
import TacticalWorldMap from "./components/camera/TacticalWorldMap";
import { useNetworkStatus } from "./hooks/useNetworkStatus";

export default function LiveCameraPage() {
    const { isOnline, toggleStatus } = useNetworkStatus();

    const [spectrumMode, setSpectrumMode] = useState<"STANDARD" | "NIGHT" | "THERMAL">("STANDARD");
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsMessage, setGpsMessage] = useState<string>("DEFAULT PERIMETER COORDINATES");
    
    // Live stream state from Raspberry Pi
    const [streamIp, setStreamIp] = useState("172.20.10.3:5000");
    const [streamOnline, setStreamOnline] = useState(true);
    const [streamFps, setStreamFps] = useState<number | string>(6.1);
    const [aiDetections, setAiDetections] = useState<Array<[string, number]>>([]);
    const [threatLevel, setThreatLevel] = useState<string>("CLEAR");
    const [threatScore, setThreatScore] = useState<number>(0.048);
    const [motionLevel, setMotionLevel] = useState<number>(0.15);
    const [loraSignal, setLoraSignal] = useState<number | null>(null);

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
        if (isOnline) {
            fetchCurrentLocation();
        }
    }, [isOnline]);

    // Live Rover State polling from Raspberry Pi
    useEffect(() => {
        if (!isOnline) return;

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
                }
            } catch (err) {
                // If local proxy fails, keep quiet and retry next tick
            }
        }, 1200);

        return () => clearInterval(interval);
    }, [isOnline]);

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

    // WHEN OFFLINE: Completely hide the camera tab, map and all controls
    if (!isOnline) {
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
                {/* Header */}
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

                        <Link
                            to="/threats"
                            className="flex items-center gap-2 px-3 py-2 text-xs font-mono font-bold text-[#C6FF3D] border border-[#C6FF3D]/40 bg-[#C6FF3D]/10 hover:border-[#C6FF3D] transition"
                        >
                            PAST THREAT EVENTS
                        </Link>

                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                            <span className="font-mono font-bold text-sm tracking-wide text-white">
                                IRONCLAD // OFFLINE RESTRICTION
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                        <button
                            onClick={() => toggleStatus(true)}
                            className="flex items-center gap-2 px-3 py-1.5 border border-[#22c55e]/50 bg-[#22c55e]/10 text-[#22c55e] hover:border-[#22c55e] transition cursor-pointer"
                        >
                            <Wifi size={13} />
                            ENABLE ONLINE MODE
                        </button>
                    </div>
                </header>

                {/* Offline Full State: Camera and Tactical Map completely hidden */}
                <main className="flex-1 flex items-center justify-center p-6">
                    <div className="max-w-md w-full border border-[#2a2a2a] bg-[#0c0c0c] p-8 text-center font-mono">
                        <div className="w-16 h-16 rounded-full border border-[#f59e0b]/40 bg-[#161208] flex items-center justify-center mx-auto mb-4">
                            <WifiOff size={28} className="text-[#f59e0b]" />
                        </div>

                        <div className="text-xs text-[#f59e0b] font-bold tracking-widest uppercase mb-1">
                            OFFLINE OPERATION ACTIVE
                        </div>
                        <h2 className="text-lg font-bold text-white mb-3">
                            LIVE CAMERA &amp; MAP HIDDEN
                        </h2>

                        <p className="text-xs text-[#888] leading-relaxed mb-6 font-sans">
                            Live video telemetry (CAM-01 Apex feed) and tactical OpenStreetMap GIS are strictly online payloads. In offline operation, all camera feeds, map services, and satellite streaming components are completely removed.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                            <Link
                                to="/"
                                className="w-full sm:w-auto px-5 py-2.5 bg-[#C6FF3D] text-black font-mono font-bold text-xs hover:bg-[#d4ff66] transition text-center"
                            >
                                BACK TO DASHBOARD
                            </Link>
                            <button
                                onClick={() => toggleStatus(true)}
                                className="w-full sm:w-auto px-5 py-2.5 border border-[#333] hover:border-[#C6FF3D] text-white hover:text-[#C6FF3D] font-mono font-bold text-xs transition cursor-pointer"
                            >
                                SWITCH ONLINE
                            </button>
                        </div>
                    </div>
                </main>

                <footer className="px-6 py-4 border-t border-[#1a1a1a] bg-[#050505] flex items-center justify-between text-xs font-mono text-[#666]">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
                        <span>IRONCLAD OFFLINE MODE ACTIVE</span>
                    </div>
                    <span>TEAM CLUTCH HEROES</span>
                </footer>
            </div>
        );
    }

    // WHEN ONLINE: Represent EXACTLY as it is originally
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

                    <Link
                        to="/threats"
                        className="hidden sm:flex items-center gap-2 px-3 py-2 text-xs font-mono font-bold text-white border border-[#333] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition cursor-pointer"
                    >
                        PAST THREAT EVENTS
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

                {/* Right side connection badge & toggle */}
                <div className="flex items-center gap-3 font-mono text-xs">
                    <button
                        onClick={() => toggleStatus(false)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-[#22c55e]/50 bg-[#22c55e]/10 text-[#22c55e] hover:border-[#22c55e] transition cursor-pointer"
                        title="Click to toggle to Offline Mode"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                        MODE: ONLINE
                    </button>

                    <div className="flex items-center gap-2 px-3 py-1 bg-[#111] border border-[#2a2a2a]">
                        <span className={`w-2 h-2 rounded-full ${streamOnline ? "bg-[#22c55e] animate-ping" : "bg-[#ef4444]"}`} />
                        <span className="text-[11px] font-bold text-white">
                            {streamOnline ? "PI LINK ACTIVE" : "PI DISCONNECTED"}
                        </span>
                        <span className="text-[10px] text-[#666]">[{streamIp}]</span>
                    </div>
                </div>
            </header>

            {/* Main Content Layout */}
            <main className="flex-1 p-6 max-w-[1700px] w-full mx-auto flex flex-col gap-6">
                {/* TOP ROW: CAMERA (LEFT) + TACTICAL MAP (RIGHT) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* LEFT: LIVE RASPBERRY PI WEBCAM STREAM */}
                    <div className="flex flex-col border border-[#2a2a2a] bg-[#090909]">
                        {/* Header bar */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] bg-[#0d0d0d] font-mono text-xs">
                            <div className="flex items-center gap-2 text-white">
                                <Camera size={14} className="text-[#C6FF3D]" />
                                <span className="font-bold">CAM-01 [FRONT APEX]</span>
                                <span className="text-[#666]">•</span>
                                <span className="text-[#888]">RASPBERRY PI CSI/USB WEBCAM</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[11px] px-2 py-0.5 border font-bold flex items-center gap-1.5 ${
                                    streamOnline 
                                        ? "border-[#22c55e]/40 bg-[#22c55e]/10 text-[#22c55e]" 
                                        : "border-[#ef4444]/40 bg-[#ef4444]/10 text-[#ef4444]"
                                }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${streamOnline ? "bg-[#22c55e] animate-pulse" : "bg-[#ef4444]"}`} />
                                    {streamOnline ? `LIVE • ${streamFps} FPS` : "STREAM OFFLINE"}
                                </span>
                            </div>
                        </div>

                        {/* Live Video Slate */}
                        <div
                            className="relative flex-1 min-h-[440px] bg-[#040404] flex items-center justify-center overflow-hidden select-none"
                            style={{
                                backgroundImage:
                                    "linear-gradient(to right, #111 1px, transparent 1px), linear-gradient(to bottom, #111 1px, transparent 1px)",
                                backgroundSize: "32px 32px",
                            }}
                        >
                            {/* Live Video Stream from Raspberry Pi */}
                            {streamOnline ? (
                                <img
                                    src="/rover-video"
                                    alt="Raspberry Pi Live Stream"
                                    className="w-full h-full object-cover transition-transform duration-300"
                                    style={{
                                        filter: getSpectrumFilter(),
                                        transform: `scale(${zoomLevel})`,
                                    }}
                                    onError={() => {
                                        // Try direct stream URL fallback
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
                                        Unable to establish MJPEG stream with Raspberry Pi at
                                        <br />
                                        <span className="text-[#C6FF3D] font-mono font-bold">http://{streamIp}/video</span>
                                    </div>

                                    <div className="flex items-center gap-2 w-full max-w-xs">
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
                                </div>
                            )}

                            {/* Minimal corner brackets */}
                            <div className="absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 border-[#C6FF3D]/60 pointer-events-none" />
                            <div className="absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 border-[#C6FF3D]/60 pointer-events-none" />
                            <div className="absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 border-[#C6FF3D]/60 pointer-events-none" />
                            <div className="absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 border-[#C6FF3D]/60 pointer-events-none" />

                            {/* Target Crosshair / Center reticle */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="relative w-16 h-16">
                                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[#C6FF3D]/30" />
                                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[#C6FF3D]/30" />
                                    <div className="w-full h-full rounded-full border border-[#C6FF3D]/25" />
                                </div>
                            </div>

                            {/* AI Target Detection Banner (Live from Pi vision pipeline) */}
                            {aiDetections.length > 0 && (
                                <div className="absolute top-6 left-6 z-10 flex items-center gap-2 px-3 py-1.5 bg-black/80 border border-[#C6FF3D] backdrop-blur font-mono text-xs">
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

                            {/* Spectrum Scanline Overlay if Night or Thermal */}
                            {spectrumMode !== "STANDARD" && (
                                <div
                                    className="absolute inset-0 pointer-events-none opacity-20"
                                    style={{
                                        backgroundImage: "repeating-linear-gradient(0deg, #000, #000 2px, transparent 2px, transparent 4px)",
                                    }}
                                />
                            )}

                            {/* Minimal bottom HUD coordinates stamp */}
                            <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between font-mono text-[11px] text-[#aaa] z-10 bg-black/60 px-3 py-1 border border-white/10 backdrop-blur">
                                <span className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
                                    FEED: 172.20.10.3:5000/video
                                </span>
                                <span>SPECTRUM: {spectrumMode}</span>
                                <span>ZOOM: {zoomLevel}X</span>
                                <span>FPS: {streamFps}</span>
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
