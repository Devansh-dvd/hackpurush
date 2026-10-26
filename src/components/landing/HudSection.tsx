import { useState, useEffect, useRef, useCallback } from "react";
import {
    Shield,
    Compass,
    Navigation,
    Activity,
    Sliders,
    Play,
    Pause,
    Square,
    RotateCcw,
    Lock,
    Unlock,
    Wifi,
    Cpu,
    Terminal,
    Crosshair
} from "lucide-react";

interface SubsystemHealth {
    name: string;
    label: string;
    score: number;
    status: "ok" | "warn" | "crit";
    metric: string;
}

export interface ArmJointConfig {
    id: string;          // API command name: base, elbow, gripper, pan, shoulder, tilt, wrist_pitch, wrist_roll
    label: string;       // Exact label matching user Pi website
    min: number;
    max: number;
    defaultAngle: number;
}

export const ARM_JOINTS: ArmJointConfig[] = [
    { id: "base", label: "base", min: 10, max: 170, defaultAngle: 90 },
    { id: "elbow", label: "elbow", min: 30, max: 150, defaultAngle: 90 },
    { id: "gripper", label: "gripper", min: 40, max: 140, defaultAngle: 90 },
    { id: "pan", label: "pan", min: 10, max: 170, defaultAngle: 90 },
    { id: "shoulder", label: "shoulder", min: 30, max: 150, defaultAngle: 90 },
    { id: "tilt", label: "tilt", min: 40, max: 140, defaultAngle: 90 },
    { id: "wrist_pitch", label: "wrist pitch", min: 10, max: 170, defaultAngle: 90 },
    { id: "wrist_roll", label: "wrist roll", min: 10, max: 170, defaultAngle: 90 },
];

export default function HudSection() {
    // Autonomous patrol states
    const [patrolActive, setPatrolActive] = useState(false);
    const [emergencyStop, setEmergencyStop] = useState(false);
    const [currentWpIndex, setCurrentWpIndex] = useState(2);
    const [totalWaypoints, setTotalWaypoints] = useState(5);
    const [statusLog, setStatusLog] = useState<string>("ROVER SYSTEM READY — STANDBY FOR COMMANDS");

    // 8-DOF Robotic arm states (synchronized with Raspberry Pi http://172.20.10.3:5000)
    const [armEnabled, setArmEnabled] = useState(false);
    const [armBusy, setArmBusy] = useState(false);
    const [armError, setArmError] = useState("");
    const [activePreset, setActivePreset] = useState("");
    const isDraggingRef = useRef(false);

    const [jointAngles, setJointAngles] = useState<Record<string, number>>({
        base: 90,
        elbow: 90,
        gripper: 90,
        pan: 90,
        shoulder: 90,
        tilt: 90,
        wrist_pitch: 90,
        wrist_roll: 90,
    });

    // Threat intelligence state
    const [threatLevel, setThreatLevel] = useState<"CLEAR" | "WATCH" | "ALERT" | "FIRE">("CLEAR");

    // Subsystems
    const subsystems: SubsystemHealth[] = [
        { name: "ESP32 SENSOR NODE", label: "ADC, Flame, Sound, DHT11, Ultrasonic", score: 99.4, status: "ok", metric: "3.3V / 4095 ADC" },
        { name: "ESP32 DRIVE NODE", label: "Dual H-Bridge, Encoder Feedback, RC Link", score: 100.0, status: "ok", metric: "24V Bus / 1000Hz" },
        { name: "PCA9685 SERVO DRIVER", label: "16-Channel PWM I2C Controller (0x40)", score: 98.8, status: "ok", metric: "8 Servos Online" },
        { name: "SX1276 LORA 868MHz", label: "Long-Range Tactical Radio Ground Link", score: 96.2, status: "ok", metric: "-68 dBm / SF7" },
        { name: "EDGE AI VISION (YOLOv8)", label: "Neural Network Perimeter Threat Pipeline", score: 99.1, status: "ok", metric: "24.2 FPS / TensorRT" },
    ];

    // Real Command Sender to Raspberry Pi via /rover-api/cmd (fallback to direct IP)
    const sendRoverCmd = useCallback(async (payload: Record<string, any>) => {
        try {
            let res: Response;
            try {
                res = await fetch("/rover-api/cmd", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } catch {
                res = await fetch("http://172.20.10.3:5000/api/cmd", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const data = await res.json();
            if (!data.ok && data.msg) {
                setArmError(data.msg);
                setStatusLog(`ROVER ALERT: ${data.msg}`);
            } else {
                setArmError("");
            }
            return data;
        } catch (err) {
            console.error("Failed to send rover command:", err);
            setArmError("Cannot reach the rover");
            return { ok: false, msg: "Cannot reach the rover" };
        }
    }, []);

    // Live background polling of Raspberry Pi arm and rover state
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                let res: Response;
                try {
                    res = await fetch("/rover-api/state");
                } catch {
                    res = await fetch("http://172.20.10.3:5000/api/state");
                }
                if (res.ok) {
                    const data = await res.json();
                    if (data.level) setThreatLevel(data.level);
                    if (data.mode) {
                        setPatrolActive(Boolean(data.patrol));
                        setEmergencyStop(data.mode === "STOP");
                    }
                    if (data.arm) {
                        setArmEnabled(Boolean(data.arm.enabled));
                        setArmBusy(Boolean(data.arm.busy));
                        if (data.arm.err) setArmError(data.arm.err);

                        // Only sync joint angles if user is not currently dragging a slider
                        if (!isDraggingRef.current && data.arm.joints) {
                            setJointAngles((prev) => {
                                const next = { ...prev };
                                Object.entries(data.arm.joints).forEach(([k, j]: [string, any]) => {
                                    if (j && typeof j.angle === "number") {
                                        next[k] = j.angle;
                                    }
                                });
                                return next;
                            });
                        }
                    }
                }
            } catch {
                // Ignore silent background network polling errors
            }
        }, 800);

        return () => clearInterval(interval);
    }, []);

    // Arm control handlers
    const handleArmToggle = async (on: boolean) => {
        setArmEnabled(on);
        setStatusLog(on ? "ARM SAFETY UNLOCKED — SERVOS READY TO MOVE" : "ARM LOCKED — SERVOS INHIBITED");
        await sendRoverCmd({ cmd: "arm_enable", on });
    };

    const handleArmPreset = async (presetName: string) => {
        if (!armEnabled) {
            setStatusLog("WARNING: Unlock arm (tick the checkbox) first to move servos");
            return;
        }
        setActivePreset(presetName.toUpperCase());
        setStatusLog(`ARM PRESET: [${presetName.toUpperCase()}] SENT TO ROVER`);
        await sendRoverCmd({ cmd: "arm_preset", name: presetName });
    };

    const handleRelaxServos = async () => {
        setActivePreset("RELAX");
        setStatusLog("SERVO PWM SIGNALS RELAXED (IDLE/DE-ENERGIZED)");
        await sendRoverCmd({ cmd: "arm_relax" });
    };

    const handleJointInput = (jointId: string, angle: number) => {
        isDraggingRef.current = true;
        setJointAngles((prev) => ({ ...prev, [jointId]: angle }));
    };

    const handleJointCommit = async (jointId: string, angle: number) => {
        isDraggingRef.current = false;
        if (!armEnabled) {
            setStatusLog("WARNING: Unlock arm (tick the checkbox) first to move servos");
            return;
        }
        setActivePreset("CUSTOM");
        setStatusLog(`JOINT [${jointId.replace('_', ' ').toUpperCase()}] SET TO ${angle}°`);
        await sendRoverCmd({ cmd: "joint", name: jointId, angle });
    };

    // Rover Navigation Command handlers
    const handlePatrolToggle = async () => {
        if (emergencyStop) {
            setStatusLog("ERROR: EMERGENCY STOP ACTIVE — RESET E-STOP BEFORE RESUMING");
            return;
        }
        const nextState = !patrolActive;
        setPatrolActive(nextState);
        await sendRoverCmd({ cmd: "patrol", on: nextState });
        const msg = nextState ? "AUTONOMOUS PATROL RESUMED — HEADING TO ACTIVE WAYPOINT" : "PATROL PAUSED — ROVER HOLDING POSITION";
        setStatusLog(msg);
    };

    const handleEmergencyStop = async () => {
        const next = !emergencyStop;
        setEmergencyStop(next);
        if (next) {
            setPatrolActive(false);
            await sendRoverCmd({ cmd: "stop" });
            setStatusLog("EMERGENCY STOP TRIGGERED: MOTOR RELAYS CUT // ARM BRAKES ENGAGED");
        } else {
            setStatusLog("EMERGENCY STOP DISENGAGED — SYSTEMS IN STANDBY");
        }
    };

    const handleAddWaypoint = async () => {
        const next = totalWaypoints + 1;
        setTotalWaypoints(next);
        await sendRoverCmd({ cmd: "wp_add" });
        setStatusLog(`WAYPOINT WP-0${next} ADDED AT CURRENT ROVER POSITION`);
    };

    const handleClearWaypoints = async () => {
        setTotalWaypoints(1);
        setCurrentWpIndex(1);
        await sendRoverCmd({ cmd: "wp_clear" });
        setStatusLog("WAYPOINTS CLEARED ON ROVER");
    };

    const handleCalibrateCompass = async () => {
        await sendRoverCmd({ cmd: "cal_compass" });
        setStatusLog("COMPASS CALIBRATION INITIATED: ROTATING 360° ON ROVER");
    };

    const threatColors = {
        CLEAR: { border: "#22c55e", bg: "rgba(34,197,94,0.12)", text: "#22c55e" },
        WATCH: { border: "#eab308", bg: "rgba(234,179,8,0.12)", text: "#eab308" },
        ALERT: { border: "#f97316", bg: "rgba(249,115,22,0.12)", text: "#f97316" },
        FIRE: { border: "#ef4444", bg: "rgba(239,68,68,0.18)", text: "#ef4444" },
    };

    return (
        <section
            id="sentry-dashboard"
            style={{
                background: "#080808",
                color: "#e0e0e0",
                fontFamily: "'Space Grotesk', sans-serif",
            }}
            className="relative overflow-hidden border-t border-[#262626]"
        >
            {/* Background grid */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.25]"
                style={{
                    backgroundImage:
                        "linear-gradient(to right, #1f1f1f 1px, transparent 1px), linear-gradient(to bottom, #1f1f1f 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                }}
            />

            <div className="relative z-10 px-6 md:px-10 py-16 md:py-20 max-w-[1700px] mx-auto">
                {/* Section Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 pb-6 border-b border-[#262626] gap-6">
                    <div>
                        <div
                            className="inline-flex items-center gap-2 text-xs font-mono px-3 py-1 mb-3"
                            style={{
                                background: "rgba(198,255,61,0.08)",
                                border: "1px solid rgba(198,255,61,0.3)",
                                color: "#C6FF3D",
                            }}
                        >
                            <Shield size={13} />
                            ABSR SENTRY MISSION CONTROL // TACTICAL DASHBOARD
                        </div>
                        <h2
                            className="font-bold tracking-tight text-white"
                            style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.8rem)" }}
                        >
                            AUTONOMOUS PATROL &amp; SENTRY COMMAND
                        </h2>
                        <p className="text-sm md:text-base text-[#8e8e8e] mt-1 max-w-2xl font-mono">
                            Central tactical command for ABSR Ground Vehicle #01 • Dual ESP32 Nodes • 6-DOF Robotic Manipulator • LoRa 868MHz Mesh Link
                        </p>
                    </div>

                    {/* Live Node Indicators */}
                    <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
                        <div className="flex items-center gap-2 px-3 py-1.5 border border-[#2a2a2a] bg-[#101010]">
                            <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                            <span className="text-[#a0a0a0]">SENSOR NODE:</span>
                            <span className="text-white font-bold">ONLINE</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 border border-[#2a2a2a] bg-[#101010]">
                            <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                            <span className="text-[#a0a0a0]">DRIVE NODE:</span>
                            <span className="text-white font-bold">ONLINE</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 border border-[#2a2a2a] bg-[#101010]">
                            <span className="w-2 h-2 rounded-full bg-[#C6FF3D] animate-pulse" />
                            <span className="text-[#a0a0a0]">PCA9685:</span>
                            <span className="text-[#C6FF3D] font-bold">READY</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 border border-[#2a2a2a] bg-[#101010]">
                            <Wifi size={13} className="text-[#3b82f6]" />
                            <span className="text-[#a0a0a0]">LORA:</span>
                            <span className="text-[#3b82f6] font-bold">-68 dBm</span>
                        </div>
                    </div>
                </div>

                {/* Status Bar / Feed Display */}
                <div
                    className="mb-8 p-3.5 flex flex-wrap items-center justify-between gap-4 font-mono text-xs border"
                    style={{
                        background: emergencyStop ? "rgba(239,68,68,0.1)" : "#0f0f0f",
                        borderColor: emergencyStop ? "#ef4444" : "#2a2a2a",
                    }}
                >
                    <div className="flex items-center gap-3">
                        <Terminal size={15} className={emergencyStop ? "text-[#ef4444]" : "text-[#C6FF3D]"} />
                        <span className="text-[#777]">TACTICAL STATUS:</span>
                        <span className={`font-bold ${emergencyStop ? "text-[#ef4444]" : "text-white"}`}>
                            {statusLog}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="text-[#777]">THREAT LEVEL:</span>
                        <div className="flex gap-1.5">
                            {(["CLEAR", "WATCH", "ALERT", "FIRE"] as const).map((lvl) => {
                                const active = threatLevel === lvl;
                                const col = threatColors[lvl];
                                return (
                                    <button
                                        key={lvl}
                                        onClick={() => {
                                            setThreatLevel(lvl);
                                            setStatusLog(`THREAT LEVEL OVERRIDDEN TO [${lvl}]`);
                                        }}
                                        className="px-2.5 py-0.5 text-[11px] font-bold tracking-wider transition"
                                        style={{
                                            border: `1px solid ${active ? col.border : "#333"}`,
                                            background: active ? col.bg : "transparent",
                                            color: active ? col.text : "#666",
                                            cursor: "pointer",
                                        }}
                                    >
                                        {lvl}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Symmetrical 2-Column Balanced Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    {/* LEFT COLUMN: AUTONOMOUS PATROL + ROBOTIC ARM CONTROLS */}
                    <div className="flex flex-col gap-8">
                        {/* 1. AUTONOMOUS PATROL & MISSION CONTROL */}
                        <div className="border border-[#2d2d2d] bg-[#0c0c0c] p-6 relative">
                            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#222]">
                                <div className="flex items-center gap-2">
                                    <Navigation size={17} className="text-[#C6FF3D]" />
                                    <h3 className="font-bold text-white text-base font-mono tracking-wide">
                                        AUTONOMOUS PATROL &amp; WAYPOINT DISPATCH
                                    </h3>
                                </div>
                                <span
                                    className="font-mono text-xs px-2.5 py-1 font-semibold flex items-center gap-1.5"
                                    style={{
                                        background: emergencyStop
                                            ? "rgba(239,68,68,0.15)"
                                            : patrolActive
                                            ? "rgba(34,197,94,0.15)"
                                            : "rgba(234,179,8,0.15)",
                                        border: `1px solid ${
                                            emergencyStop ? "#ef4444" : patrolActive ? "#22c55e" : "#eab308"
                                        }`,
                                        color: emergencyStop ? "#ef4444" : patrolActive ? "#22c55e" : "#eab308",
                                    }}
                                >
                                    <span
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{
                                            background: emergencyStop
                                                ? "#ef4444"
                                                : patrolActive
                                                ? "#22c55e"
                                                : "#eab308",
                                        }}
                                    />
                                    {emergencyStop ? "E-STOP ENGAGED" : patrolActive ? "AUTO PATROLLING" : "STANDBY"}
                                </span>
                            </div>

                            {/* Waypoint Telemetry Mini-Strip */}
                            <div className="grid grid-cols-3 gap-3 p-3.5 bg-[#121212] border border-[#222] font-mono text-xs mb-5">
                                <div>
                                    <span className="text-[#666] block">CURRENT TARGET</span>
                                    <span className="text-white font-bold text-sm">WP-0{currentWpIndex} / {totalWaypoints}</span>
                                </div>
                                <div>
                                    <span className="text-[#666] block">WP BEARING</span>
                                    <span className="text-[#C6FF3D] font-bold text-sm">042° N-NE (6.2m)</span>
                                </div>
                                <div>
                                    <span className="text-[#666] block">DRIVE SPEED</span>
                                    <span className="text-white font-bold text-sm">{patrolActive && !emergencyStop ? "1.2 m/s" : "0.0 m/s"}</span>
                                </div>
                            </div>

                            {/* Command Action Buttons */}
                            <div className="flex flex-wrap gap-2.5">
                                <button
                                    onClick={handlePatrolToggle}
                                    className="flex items-center gap-2 px-5 py-3 font-mono font-bold text-xs uppercase tracking-wider transition"
                                    style={{
                                        background: patrolActive ? "#202020" : "#C6FF3D",
                                        color: patrolActive ? "#e0e0e0" : "#000",
                                        border: patrolActive ? "1px solid #444" : "1px solid #C6FF3D",
                                        cursor: "pointer",
                                    }}
                                >
                                    {patrolActive ? (
                                        <>
                                            <Pause size={14} /> PAUSE PATROL
                                        </>
                                    ) : (
                                        <>
                                            <Play size={14} fill="#000" /> START PATROL
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={handleEmergencyStop}
                                    className="flex items-center gap-2 px-5 py-3 font-mono font-bold text-xs uppercase tracking-wider transition"
                                    style={{
                                        background: emergencyStop ? "#ef4444" : "rgba(239,68,68,0.18)",
                                        color: emergencyStop ? "#fff" : "#ef4444",
                                        border: "1.5px solid #ef4444",
                                        cursor: "pointer",
                                    }}
                                >
                                    <Square size={14} />
                                    {emergencyStop ? "DISENGAGE E-STOP" : "EMERGENCY STOP"}
                                </button>

                                <button
                                    onClick={handleAddWaypoint}
                                    className="flex items-center gap-2 px-4 py-3 font-mono font-bold text-xs uppercase tracking-wider bg-[#141414] text-white border border-[#444] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition cursor-pointer"
                                >
                                    <Crosshair size={14} /> ADD WAYPOINT
                                </button>

                                <button
                                    onClick={handleClearWaypoints}
                                    className="flex items-center gap-2 px-4 py-3 font-mono font-bold text-xs uppercase tracking-wider bg-[#141414] text-[#aaa] border border-[#333] hover:border-[#ef4444] hover:text-[#ef4444] transition cursor-pointer"
                                >
                                    <RotateCcw size={14} /> CLEAR WAYPOINTS
                                </button>

                                <button
                                    onClick={handleCalibrateCompass}
                                    className="flex items-center gap-2 px-4 py-3 font-mono font-bold text-xs uppercase tracking-wider bg-[#141414] text-[#aaa] border border-[#333] hover:border-[#3b82f6] hover:text-[#3b82f6] transition cursor-pointer"
                                >
                                    <Compass size={14} /> CALIBRATE COMPASS
                                </button>
                            </div>
                        </div>

                        {/* 2. ROBOTIC ARM CONTROL (SYNCHRONIZED WITH RASPBERRY PI) */}
                        <div className="border border-[#2d2d2d] bg-[#0c0c0c] p-6">
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#222]">
                                <div className="flex items-center gap-2">
                                    <Sliders size={17} className="text-[#C6FF3D]" />
                                    <h3 className="font-bold text-white text-base font-mono tracking-wide">
                                        Robotic arm
                                    </h3>
                                </div>

                                <button
                                    onClick={() => handleArmToggle(!armEnabled)}
                                    className="flex items-center gap-1.5 font-mono text-xs px-3 py-1 font-bold transition cursor-pointer"
                                    style={{
                                        background: armEnabled ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                        border: `1px solid ${armEnabled ? "#22c55e" : "#ef4444"}`,
                                        color: armEnabled ? "#22c55e" : "#ef4444",
                                    }}
                                >
                                    {armEnabled ? <Unlock size={12} /> : <Lock size={12} />}
                                    {armEnabled ? "ARM ENABLED" : "ARM LOCKED"}
                                </button>
                            </div>

                            {/* Unlock Checkbox */}
                            <label className="flex items-center gap-3 mb-5 p-3.5 bg-[#121212] border border-[#262626] rounded cursor-pointer select-none hover:border-[#C6FF3D]/50 transition">
                                <input
                                    type="checkbox"
                                    checked={armEnabled}
                                    onChange={(e) => handleArmToggle(e.target.checked)}
                                    className="w-4 h-4 accent-[#C6FF3D] cursor-pointer"
                                />
                                <span className="text-xs font-mono font-medium text-white tracking-wide">
                                    Unlock arm (the servos only move when this is ticked)
                                </span>
                            </label>

                            {/* Preset Buttons Grid */}
                            <div className="mb-6">
                                <div className="flex flex-wrap gap-2.5">
                                    {[
                                        { name: "home", label: "Home" },
                                        { name: "reach", label: "Reach" },
                                        { name: "open", label: "Open" },
                                        { name: "close", label: "Close" },
                                        { name: "look", label: "Look" },
                                    ].map((p) => {
                                        const isCurrent = activePreset === p.name.toUpperCase();
                                        return (
                                            <button
                                                key={p.name}
                                                onClick={() => handleArmPreset(p.name)}
                                                disabled={!armEnabled}
                                                className={`px-4 py-2.5 text-xs font-mono font-bold tracking-wider rounded border transition cursor-pointer ${
                                                    !armEnabled
                                                        ? "opacity-50 border-[#2b2b2b] text-[#666] bg-[#141414] cursor-not-allowed"
                                                        : isCurrent
                                                        ? "bg-[#C6FF3D]/15 border-[#C6FF3D] text-[#C6FF3D]"
                                                        : "bg-[#141414] border-[#333] text-white hover:border-[#C6FF3D] hover:text-[#C6FF3D]"
                                                }`}
                                            >
                                                {p.label}
                                            </button>
                                        );
                                    })}
                                    <button
                                        onClick={handleRelaxServos}
                                        disabled={!armEnabled}
                                        className={`px-4 py-2.5 text-xs font-mono font-bold tracking-wider rounded border transition cursor-pointer ${
                                            !armEnabled
                                                ? "opacity-50 border-[#2b2b2b] text-[#666] bg-[#141414] cursor-not-allowed"
                                                : "bg-[#141414] border-[#eab308]/50 text-[#eab308] hover:bg-[#eab308]/15"
                                        }`}
                                    >
                                        Relax servos
                                    </button>
                                </div>
                                {armError && (
                                    <div className="mt-2 text-xs font-mono text-[#ef4444]">
                                        {armError}
                                    </div>
                                )}
                                {armBusy && (
                                    <div className="mt-2 text-xs font-mono text-[#f59e0b] animate-pulse">
                                        Moving servos...
                                    </div>
                                )}
                            </div>

                            {/* 8-DOF Joint Sliders */}
                            <div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    {ARM_JOINTS.map((j) => {
                                        const angle = jointAngles[j.id] ?? j.defaultAngle;
                                        return (
                                            <div key={j.id} className="p-3 bg-[#111] border border-[#242424] font-mono">
                                                <div className="flex justify-between items-center text-xs mb-1.5">
                                                    <span className="text-white font-semibold lowercase tracking-wide">{j.label}</span>
                                                    <span className="text-[#C6FF3D] font-bold text-sm">{angle}</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min={j.min}
                                                    max={j.max}
                                                    value={angle}
                                                    disabled={!armEnabled}
                                                    onPointerDown={() => { isDraggingRef.current = true; }}
                                                    onTouchStart={() => { isDraggingRef.current = true; }}
                                                    onChange={(e) => {
                                                        const v = parseInt(e.target.value);
                                                        handleJointInput(j.id, v);
                                                    }}
                                                    onPointerUp={(e) => {
                                                        const v = parseInt((e.target as HTMLInputElement).value);
                                                        handleJointCommit(j.id, v);
                                                    }}
                                                    onTouchEnd={(e) => {
                                                        const v = parseInt((e.target as HTMLInputElement).value);
                                                        handleJointCommit(j.id, v);
                                                    }}
                                                    className="w-full accent-[#0284c7] cursor-pointer h-2 bg-[#2a2a2a] rounded"
                                                />
                                                <div className="flex justify-between text-[10px] text-[#555] mt-1">
                                                    <span>{j.min}</span>
                                                    <span>{j.max}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: THREAT FUSION & HARDWARE SUBSYSTEM HEALTH */}
                    <div className="flex flex-col gap-8">
                        {/* 3. MULTI-MODAL THREAT FUSION DIAGNOSTICS */}
                        <div className="border border-[#2d2d2d] bg-[#0c0c0c] p-6">
                            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#222]">
                                <div className="flex items-center gap-2">
                                    <Activity size={17} className="text-[#C6FF3D]" />
                                    <h3 className="font-bold text-white text-base font-mono tracking-wide">
                                        THREAT FUSION INTELLIGENCE
                                    </h3>
                                </div>
                                <span
                                    className="font-mono text-xs px-2.5 py-0.5 font-bold"
                                    style={{
                                        background: threatColors[threatLevel].bg,
                                        border: `1px solid ${threatColors[threatLevel].border}`,
                                        color: threatColors[threatLevel].text,
                                    }}
                                >
                                    ● {threatLevel}
                                </span>
                            </div>

                            {/* Threat Metrics Bars */}
                            <div className="flex flex-col gap-3 font-mono text-xs">
                                {[
                                    { name: "VISION (YOLOv8 SENTRY)", val: "12%", score: 12, col: "#C6FF3D", desc: "No unauthorized humans/vehicles detected in perimeter" },
                                    { name: "ACOUSTIC SIGNATURE", val: "04%", score: 4, col: "#22c55e", desc: "Sound ADC baseline nominal • Subtraction active" },
                                    { name: "METAL COIL INDUCTION", val: "00%", score: 0, col: "#3b82f6", desc: "Zero ordnance / mine induction hits detected" },
                                    { name: "FLAME IR SPECTRAL", val: "00%", score: 0, col: "#eab308", desc: "Zero combustion flare • ADC count above threshold" },
                                    { name: "ULTRASONIC PROXIMITY", val: "08%", score: 8, col: "#a855f7", desc: "Safe forward obstacle clearance > 350cm" },
                                ].map((mod) => (
                                    <div key={mod.name} className="p-3 bg-[#121212] border border-[#222]">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-white font-semibold">{mod.name}</span>
                                            <span style={{ color: mod.col }} className="font-bold">{mod.val}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden mb-1.5">
                                            <div
                                                className="h-full rounded-full transition-all duration-300"
                                                style={{ width: `${Math.max(mod.score, 4)}%`, background: mod.col }}
                                            />
                                        </div>
                                        <span className="text-[11px] text-[#777]">{mod.desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 4. HARDWARE SUBSYSTEM HEALTH SCORES */}
                        <div className="border border-[#2d2d2d] bg-[#0c0c0c] p-6">
                            <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#222]">
                                <div className="flex items-center gap-2">
                                    <Cpu size={17} className="text-[#C6FF3D]" />
                                    <h3 className="font-bold text-white text-base font-mono tracking-wide">
                                        HARDWARE SUBSYSTEM HEALTH
                                    </h3>
                                </div>
                                <span className="font-mono text-xs text-[#22c55e] font-bold">5/5 NOMINAL</span>
                            </div>

                            <div className="flex flex-col gap-3 font-mono text-xs">
                                {subsystems.map((sub) => (
                                    <div key={sub.name} className="p-3 bg-[#111] border border-[#222]">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-white font-bold">{sub.name}</span>
                                            <span className="text-[#22c55e] font-bold">{sub.score}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-[#222] rounded-full overflow-hidden mb-1.5">
                                            <div
                                                className="h-full rounded-full bg-[#22c55e]"
                                                style={{ width: `${sub.score}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[11px] text-[#777]">
                                            <span>{sub.label}</span>
                                            <span className="text-[#aaa]">{sub.metric}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer strip */}
            <div
                className="relative z-10 px-6 md:px-10 py-5 flex flex-col sm:flex-row items-center justify-between text-xs border-t border-[#222]"
                style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#888",
                    background: "#050505",
                }}
            >
                <div className="flex items-center gap-2 mb-2 sm:mb-0">
                    <span className="w-2 h-2 rounded-full bg-[#C6FF3D]" />
                    <span>IRONCLAD ABSR ROVER • SECTOR-04 BRAVO DEFENSE GRID</span>
                </div>
                <span>TEAM CLUTCH HEROES • AUTONOMOUS SENTRY ARCHITECTURE</span>
            </div>
        </section>
    );
}
