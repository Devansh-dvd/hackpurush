import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    Camera,
    MapPin,
    Compass,
    Radio,
    Shield,
    Maximize2,
    Crosshair,
    Navigation,
    Activity,
    Wifi
} from "lucide-react";
import TacticalWorldMap from "./components/camera/TacticalWorldMap";

export default function LiveCameraPage() {
    const [spectrumMode, setSpectrumMode] = useState<"STANDARD" | "NIGHT" | "THERMAL">("STANDARD");
    const [zoomLevel, setZoomLevel] = useState<number>(1);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsMessage, setGpsMessage] = useState<string>("DEFAULT PERIMETER COORDINATES");

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
        fetchCurrentLocation();
    }, []);

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
            </header>

            {/* Main Content Layout */}
            <main className="flex-1 p-6 max-w-[1700px] w-full mx-auto flex flex-col gap-6">
                {/* TOP ROW: CAMERA (LEFT) + TACTICAL MAP (RIGHT) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* LEFT: BLANK CAMERA CONTAINER (READY FOR RASPBERRY PI WEBCAM) */}
                    <div className="flex flex-col border border-[#2a2a2a] bg-[#090909]">
                        {/* Header bar */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] bg-[#0d0d0d] font-mono text-xs">
                            <div className="flex items-center gap-2 text-white">
                                <Camera size={14} className="text-[#C6FF3D]" />
                                <span className="font-bold">CAM-01 [FRONT APEX]</span>
                                <span className="text-[#666]">•</span>
                                <span className="text-[#888]">RASPBERRY PI CSI/USB WEBCAM</span>
                            </div>
                            <span className="text-[11px] px-2 py-0.5 border border-[#333] bg-[#141414] text-[#888]">
                                STANDBY // READY FOR :5000/video
                            </span>
                        </div>

                        {/* Blank Video Slate */}
                        <div
                            className="relative flex-1 min-h-[420px] bg-[#050505] flex flex-col items-center justify-center p-8 overflow-hidden select-none"
                            style={{
                                backgroundImage:
                                    "linear-gradient(to right, #111 1px, transparent 1px), linear-gradient(to bottom, #111 1px, transparent 1px)",
                                backgroundSize: "32px 32px",
                            }}
                        >
                            {/* Minimal corner brackets */}
                            <div className="absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 border-[#333]" />
                            <div className="absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 border-[#333]" />
                            <div className="absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 border-[#333]" />
                            <div className="absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 border-[#333]" />

                            {/* Center minimal placeholder */}
                            <div className="flex flex-col items-center justify-center text-center max-w-sm">
                                <div className="w-14 h-14 rounded-full border border-[#262626] bg-[#0d0d0d] flex items-center justify-center mb-3">
                                    <Camera size={22} className="text-[#555]" />
                                </div>
                                <div className="font-mono text-xs font-bold text-[#888] tracking-wider mb-1">
                                    LIVE WEBCAM VIEWPORT
                                </div>
                                <div className="font-mono text-[11px] text-[#555] leading-relaxed">
                                    Awaiting Raspberry Pi video stream endpoint
                                    <br />
                                    <span className="text-[#444] font-mono">http://&lt;pi-ip&gt;:5000/video</span>
                                </div>
                            </div>

                            {/* Minimal bottom HUD coordinates stamp */}
                            <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between font-mono text-[11px] text-[#555]">
                                <span>OPTICAL FPS: --</span>
                                <span>RES: 1920x1080</span>
                                <span>SPECTRUM: {spectrumMode}</span>
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
                            <span className="text-[10px] text-[#3b82f6] font-bold">LORA -68 dBm</span>
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
                    <span>SKOPEO ABSR TACTICAL SURVEILLANCE • SECTOR-04 BRAVO</span>
                </div>
                <span>TEAM RAMBHAROSE</span>
            </footer>
        </div>
    );
}
