import { useState, useEffect } from "react";
import { Shield, ArrowUpRight } from "lucide-react";
import RoboticArmGraphic from "./RoboticArmGraphic";
import { Link } from "react-router-dom";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";

function useClock(): Date {
    const [t, setT] = useState<Date>(new Date());

    useEffect(() => {
        const id = setInterval(() => setT(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    return t;
}

const pad = (n: number): string =>
    n.toString().padStart(2, "0");

export default function CyberBrutalSection({ onViewTwin, onScrollToDrone, onScrollToHud }: { onViewTwin: () => void; onScrollToDrone: () => void; onScrollToHud: () => void }) {
    const time = useClock();
    const [glitch, setGlitch] = useState(false);
    const { isOnline, toggleStatus } = useNetworkStatus();

    return (
        <section style={{ background: "#050505", color: "#e8e8e8", fontFamily: "'Space Grotesk', sans-serif" }} className="relative overflow-hidden">
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.35]"
                style={{
                    backgroundImage: "linear-gradient(to right, #161616 1px, transparent 1px), linear-gradient(to bottom, #161616 1px, transparent 1px)",
                    backgroundSize: "42px 42px",
                }}
            />

            <div className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5 border-b" style={{ borderColor: "#3a3a3a" }}>
                <div className="flex items-center gap-2">
                    <span style={{ background: "#C6FF3D" }} className="w-3 h-3 inline-block" />
                    <span className="tracking-tight font-bold text-3xl" style={{ color: "#fff" }}>IRONCLAD</span>
                    <span className="hidden sm:inline text-xs px-2 py-0.5 ml-2 font-mono" style={{ background: "#161616", border: "1px solid #333", color: "#C6FF3D" }}>SENTINEL-ARM</span>
                </div>
                <div className="hidden md:flex items-center gap-8 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#d0d0d0" }}>
                    <span className="hover:text-white cursor-pointer transition" onClick={onScrollToDrone}>ROVER 3D &amp; SENSORS</span>
                    <span className="hover:text-[#C6FF3D] cursor-pointer transition font-semibold" onClick={onScrollToHud}>MISSION DASHBOARD</span>
                    <Link
                        to="/threats"
                        className="hover:text-[#C6FF3D] text-[#e8e8e8] hover:text-white transition font-semibold flex items-center gap-1.5"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
                        PAST THREAT EVENTS
                    </Link>
                    {isOnline && (
                        <Link to="/camera" className="hover:text-[#C6FF3D] text-[#C6FF3D] transition font-semibold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#C6FF3D] animate-ping" />
                            LIVE CAMERA
                        </Link>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => toggleStatus(!isOnline)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono border transition cursor-pointer ${
                            isOnline
                                ? "border-[#22c55e]/50 bg-[#22c55e]/10 text-[#22c55e] hover:border-[#22c55e]"
                                : "border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b] hover:border-[#f59e0b]"
                        }`}
                        title="Click to toggle Online/Offline Mode"
                    >
                        <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-[#22c55e] animate-pulse" : "bg-[#f59e0b]"}`} />
                        <span>{isOnline ? "ONLINE" : "OFFLINE"}</span>
                    </button>
                    <span className="hidden sm:inline text-sm" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#b0b0b0" }}>
                        {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
                    </span>
                </div>
            </div>

            <div className="relative z-10 grid md:grid-cols-2 gap-10 px-6 md:px-10 py-16 md:py-24 items-center">
                <div>
                    <div className="inline-block text-xs mb-6 px-2 py-1" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#C6FF3D", border: "1px solid #4a6a10" }}>
                        &nbsp; BORDER SURVEILLANCE // ROBOTIC ARM DIGITAL TWIN
                    </div>
                    <h1
                        onMouseEnter={() => setGlitch(true)}
                        onMouseLeave={() => setGlitch(false)}
                        className="font-bold leading-[0.95] mb-6"
                        style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
                    >
                        <span style={{ position: "relative", display: "inline-block" }}>
                            PREVENT THREATS
                            {glitch && (
                                <span aria-hidden="true" style={{ position: "absolute", left: 2, top: 0, color: "#ff2d55", clipPath: "inset(0 0 55% 0)", opacity: 0.7 }}>
                                    PREVENT THREATS
                                </span>
                            )}
                        </span>
                        <br />
                        BEFORE THEY HAPPEN.
                    </h1>
                    <p className="max-w-md mb-8" style={{ color: "#d0d0d0", fontSize: "1.125rem", lineHeight: 1.7 }}>
                        A live physics-informed digital twin of the autonomous border surveillance robotic arm.
                        Continuously tracking perimeter sectors, calculating real-time inverse kinematics, and
                        intercepting incursions before breach occurs.
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            onClick={onScrollToHud}
                            style={{
                                background: "#C6FF3D",
                                color: "#050505",
                                cursor: "pointer",
                            }}
                            className="font-bold px-7 py-4 text-base hover:brightness-110 transition flex items-center gap-2"
                        >
                            <Shield size={18} />
                            MISSION DASHBOARD
                        </button>

                        <button
                            onClick={onViewTwin}
                            className="
                                flex items-center gap-2
                                px-7 py-4
                                text-base font-bold
                                text-white
                                border border-[#666]
                                hover:border-[#C6FF3D]
                                hover:text-[#C6FF3D]
                                transition
                                cursor-pointer
                            "
                        >
                            3D ROVER TWIN
                        </button>

                        <Link
                            to="/threats"
                            className="
                                flex items-center gap-2
                                px-6 py-4
                                text-base font-bold
                                text-white
                                border border-[#444]
                                hover:border-[#C6FF3D]
                                hover:text-[#C6FF3D]
                                hover:bg-[#C6FF3D]/10
                                transition
                            "
                        >
                            PAST THREATS
                            <ArrowUpRight size={17} />
                        </Link>

                        {isOnline && (
                            <Link
                                to="/camera"
                                className="
                                    flex items-center gap-2
                                    px-6 py-4
                                    text-base font-bold
                                    text-[#C6FF3D]
                                    border border-[#C6FF3D]/50
                                    hover:border-[#C6FF3D]
                                    hover:bg-[#C6FF3D]/10
                                    transition
                                "
                            >
                                LIVE CAMERA
                                <ArrowUpRight size={17} />
                            </Link>
                        )}
                    </div>
                </div>

                <div className="relative" style={{ border: "1px solid #3a3a3a", background: "#0a0a0a" }}>
                    <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ borderBottom: "1px solid #3a3a3a", fontFamily: "'JetBrains Mono', monospace", color: "#c0c0c0" }}>
                        <span className="flex items-center gap-1.5"><Shield size={13} color="#C6FF3D" />&gt;ROBOTIC_ARM_SENTRY_SIMULATION</span>
                        <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D] animate-ping" />
                            <span className="text-xs" style={{ color: "#C6FF3D" }}>ACTIVE // 240Hz</span>
                        </span>
                    </div>
                    <div className="h-64 md:h-80">
                        <RoboticArmGraphic />
                    </div>
                </div>
            </div>

        </section>
    );
}