import { useEffect, useState, useRef } from "react";

export default function RoboticArmGraphic() {
    const [tick, setTick] = useState(0);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        let animId: number;
        let lastTime = performance.now();

        const loop = (currentTime: number) => {
            const delta = currentTime - lastTime;
            if (delta > 32) { // ~30 fps update
                setTick(t => t + 1);
                lastTime = currentTime;
            }
            animId = requestAnimationFrame(loop);
        };

        animId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animId);
    }, []);

    const phase = tick * 0.05;

    // Dimensions
    const width = 480;
    const height = 320;

    // Threat incursion simulation (moving near border demarcation)
    // Moves along a realistic surveillance search perimeter
    const threat1X = 330 + Math.sin(phase * 0.7) * 75;
    const threat1Y = 85 + Math.cos(phase * 0.45) * 35;

    const threat2X = 390 + Math.cos(phase * 0.3) * 45;
    const threat2Y = 160 + Math.sin(phase * 0.6) * 30;

    // Target to aim at: user mouse if hovering inside SVG, otherwise autonomous threat lock
    const activeTarget = mousePos
        ? { x: mousePos.x, y: mousePos.y, label: "MANUAL_LOCK", isThreat: false }
        : { x: threat1X, y: threat1Y, label: "THREAT_ALPHA", isThreat: true };

    // Sentry Arm Kinematics (2-Link + Gimbal Head Inverse Kinematics)
    // Base mounted at sentry pedestal
    const bx = 145;
    const by = 235;

    const L1 = 78; // Upper Arm length
    const L2 = 68; // Forearm length
    const L3 = 26; // End-Effector / Surveillance Turret

    const dx = activeTarget.x - bx;
    const dy = activeTarget.y - by;
    const distToTarget = Math.hypot(dx, dy);

    // Reachable clamp
    const maxReach = L1 + L2 - 4;
    const minReach = 45;
    const clampedDist = Math.max(minReach, Math.min(maxReach, distToTarget));

    // Inverse Kinematics solver
    const targetAngle = Math.atan2(dy, dx);
    const cosElbow = (L1 * L1 + L2 * L2 - clampedDist * clampedDist) / (2 * L1 * L2);
    const clampedCosElbow = Math.max(-1, Math.min(1, cosElbow));
    const elbowInternal = Math.acos(clampedCosElbow);

    const cosShoulderOffset = (L1 * L1 + clampedDist * clampedDist - L2 * L2) / (2 * L1 * clampedDist);
    const shoulderOffset = Math.acos(Math.max(-1, Math.min(1, cosShoulderOffset)));

    // Joint angles (elbow up configuration for crane/sentry arm)
    const theta1 = targetAngle - shoulderOffset;
    const theta2 = theta1 + (Math.PI - elbowInternal);

    // Positions
    const j1x = bx;
    const j1y = by - 12; // elevated shoulder pivot

    const j2x = j1x + L1 * Math.cos(theta1);
    const j2y = j1y + L1 * Math.sin(theta1);

    const j3x = j2x + L2 * Math.cos(theta2);
    const j3y = j2y + L2 * Math.sin(theta2);

    // End-effector points directly at the target
    const headAngle = Math.atan2(activeTarget.y - j3y, activeTarget.x - j3x);
    const eex = j3x + L3 * Math.cos(headAngle);
    const eey = j3y + L3 * Math.sin(headAngle);

    // Hydraulic piston anchor points for realistic mechanical aesthetics
    const pistonBaseX = bx + 12;
    const pistonBaseY = by - 2;
    const pistonMidX = j1x + (L1 * 0.45) * Math.cos(theta1) + 6 * Math.sin(theta1);
    const pistonMidY = j1y + (L1 * 0.45) * Math.sin(theta1) - 6 * Math.cos(theta1);

    // Display telemetry degrees
    const j1Deg = Math.round(((theta1 * 180) / Math.PI + 360) % 360);
    const j2Deg = Math.round((((theta2 - theta1) * 180) / Math.PI + 360) % 360);
    const j3Deg = Math.round(((headAngle * 180) / Math.PI + 360) % 360);
    const torqueLoad = (38.4 + Math.sin(phase * 0.8) * 4.2).toFixed(1);

    // Laser beam scan cone angles
    const coneAngle1 = headAngle - 0.12;
    const coneAngle2 = headAngle + 0.12;
    const coneDist = 260;
    const c1x = eex + coneDist * Math.cos(coneAngle1);
    const c1y = eey + coneDist * Math.sin(coneAngle1);
    const c2x = eex + coneDist * Math.cos(coneAngle2);
    const c2y = eey + coneDist * Math.sin(coneAngle2);

    // Handle mouse interaction
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        setMousePos({ x: mx, y: my });
    };

    const handleMouseLeave = () => {
        setMousePos(null);
    };

    return (
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#080808" }}>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            >
                <defs>
                    {/* Targeting Laser Glow */}
                    <filter id="laserGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    <filter id="threatGlow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Laser Sensor Scan Cone Gradient */}
                    <radialGradient id="sensorConeGrad" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
                        gradientTransform={`translate(${eex}, ${eey}) rotate(${(headAngle * 180) / Math.PI}) scale(${coneDist})`}>
                        <stop offset="0%" stopColor="#C6FF3D" stopOpacity="0.35" />
                        <stop offset="40%" stopColor="#C6FF3D" stopOpacity="0.08" />
                        <stop offset="100%" stopColor="#C6FF3D" stopOpacity="0" />
                    </radialGradient>

                    {/* Linear pattern for border warning */}
                    <pattern id="hazardStripe" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="5" height="10" fill="#222" />
                        <rect x="5" width="5" height="10" fill="#C6FF3D" opacity="0.6" />
                    </pattern>
                </defs>

                {/* 1. Tactical Grid Background */}
                {Array.from({ length: 25 }, (_, i) => (
                    <line key={`vg${i}`} x1={i * 20} y1={0} x2={i * 20} y2={height} stroke="#121212" strokeWidth="0.5" />
                ))}
                {Array.from({ length: 17 }, (_, i) => (
                    <line key={`hg${i}`} x1={0} y1={i * 20} x2={width} y2={i * 20} stroke="#121212" strokeWidth="0.5" />
                ))}

                {/* 2. Border Demarcation Line & Surveillance Sector */}
                <g opacity="0.85">
                    {/* Border boundary fence line */}
                    <line x1="280" y1="20" x2="470" y2="20" stroke="#ff3b30" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.6" />
                    <text x="282" y="15" fill="#ff453a" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.8">
                        BORDER DEMARCATION // SECTOR-04 BRAVO
                    </text>

                    {/* Buffer zone demarcation arc */}
                    <path
                        d="M 220 280 A 180 180 0 0 0 460 120"
                        fill="none"
                        stroke="#222"
                        strokeWidth="1"
                        strokeDasharray="6 4"
                    />
                    <text x="320" y="270" fill="#444" fontSize="6" fontFamily="'JetBrains Mono', monospace">
                        PERIMETER BUFFER PERIMETER: 150m
                    </text>
                </g>

                {/* 3. Laser Sweep Cone from Robotic Arm End-Effector */}
                <polygon
                    points={`${eex},${eey} ${c1x},${c1y} ${c2x},${c2y}`}
                    fill="url(#sensorConeGrad)"
                />

                {/* Concentrated Targeting Laser Line */}
                <line
                    x1={eex}
                    y1={eey}
                    x2={activeTarget.x}
                    y2={activeTarget.y}
                    stroke="#C6FF3D"
                    strokeWidth="1.5"
                    filter="url(#laserGlow)"
                    opacity="0.9"
                />
                <line
                    x1={eex}
                    y1={eey}
                    x2={activeTarget.x}
                    y2={activeTarget.y}
                    stroke="#ffffff"
                    strokeWidth="0.6"
                    opacity="0.95"
                />

                {/* 4. Border Incursion Threats Simulation */}
                {/* Threat Alpha (Active Primary Target) */}
                <g transform={`translate(${threat1X}, ${threat1Y})`} filter="url(#threatGlow)">
                    {/* Targeting Reticle & Lock rings */}
                    <circle cx={0} cy={0} r={14 + Math.sin(phase * 4) * 2} fill="none" stroke="#ff3b30" strokeWidth="0.8" strokeDasharray="5 3">
                        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="4s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={0} cy={0} r={5} fill="rgba(255, 59, 48, 0.2)" stroke="#ff3b30" strokeWidth="1" />

                    {/* Threat Crosshair Corners */}
                    <path d="M -10 -5 L -10 -10 L -5 -10" fill="none" stroke="#C6FF3D" strokeWidth="1.2" />
                    <path d="M 10 -5 L 10 -10 L 5 -10" fill="none" stroke="#C6FF3D" strokeWidth="1.2" />
                    <path d="M -10 5 L -10 10 L -5 10" fill="none" stroke="#C6FF3D" strokeWidth="1.2" />
                    <path d="M 10 5 L 10 10 L 5 10" fill="none" stroke="#C6FF3D" strokeWidth="1.2" />

                    {/* Threat Laser Impact Point */}
                    <circle cx={0} cy={0} r={2} fill="#C6FF3D" />
                    <circle cx={0} cy={0} r={8} fill="none" stroke="#C6FF3D" strokeWidth="0.5" opacity="0.7">
                        <animate attributeName="r" values="3;16;3" dur="1.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8;0.0;0.8" dur="1.2s" repeatCount="indefinite" />
                    </circle>

                    {/* Threat Tag HUD readout */}
                    <rect x="14" y="-12" width="76" height="22" fill="rgba(10,10,10,0.85)" stroke="#ff3b30" strokeWidth="0.6" rx="2" />
                    <text x="18" y="-4" fill="#ff453a" fontSize="6.5" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                        [LOCK] INTRUDER-A
                    </text>
                    <text x="18" y="5" fill="#a0a0a0" fontSize="5.5" fontFamily="'JetBrains Mono', monospace">
                        RNG: {Math.round(distToTarget * 0.4)}m | 98.6%
                    </text>
                </g>

                {/* Threat Bravo (Secondary Perimeter Scout Drone) */}
                <g transform={`translate(${threat2X}, ${threat2Y})`}>
                    <rect x={-5} y={-5} width={10} height={10} fill="none" stroke="#e8c34a" strokeWidth="0.8" transform="rotate(45)" opacity="0.7" />
                    <circle cx={0} cy={0} r={1.5} fill="#e8c34a" />
                    <text x={8} y={3} fill="#888" fontSize="5.5" fontFamily="'JetBrains Mono', monospace">
                        UAV-02 (PATROL)
                    </text>
                </g>

                {/* 5. Robotic Arm Mechanical Structure */}
                {/* Sentry Heavy Mounting Base & Pedestal */}
                <g>
                    {/* Foundation Floor Plate */}
                    <rect x={bx - 45} y={by + 30} width="90" height="8" fill="#181818" stroke="#333" strokeWidth="0.8" rx="1" />
                    <rect x={bx - 36} y={by + 16} width="72" height="14" fill="#202020" stroke="#383838" strokeWidth="0.8" />
                    
                    {/* Hazard warning stripe plate */}
                    <rect x={bx - 32} y={by + 20} width="64" height="6" fill="url(#hazardStripe)" />

                    {/* Azimuth Rotation Ring & Bearings */}
                    <ellipse cx={bx} cy={by + 10} rx="26" ry="7" fill="#141414" stroke="#444" strokeWidth="1" />
                    <ellipse cx={bx} cy={by + 8} rx="20" ry="5" fill="#0d0d0d" stroke="#C6FF3D" strokeWidth="0.6" opacity="0.8" />

                    {/* Base Turret Body */}
                    <path
                        d={`M ${bx - 20} ${by + 8} L ${bx - 14} ${by - 12} L ${bx + 14} ${by - 12} L ${bx + 20} ${by + 8} Z`}
                        fill="#1c1c1c"
                        stroke="#404040"
                        strokeWidth="1"
                    />

                    {/* Sentry Arm Base Status Indicator */}
                    <circle cx={bx - 8} cy={by - 2} r="2" fill="#C6FF3D" opacity={0.6 + Math.sin(phase * 3) * 0.4} />
                    <text x={bx - 3} y={by} fill="#888" fontSize="5" fontFamily="'JetBrains Mono', monospace">ARM-01</text>
                </g>

                {/* Hydraulic Piston connected to Lower Arm */}
                <line
                    x1={pistonBaseX}
                    y1={pistonBaseY}
                    x2={pistonMidX}
                    y2={pistonMidY}
                    stroke="#555"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                />
                <line
                    x1={pistonBaseX}
                    y1={pistonBaseY}
                    x2={pistonMidX}
                    y2={pistonMidY}
                    stroke="#C6FF3D"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    opacity="0.8"
                />

                {/* LINK 1: Shoulder Upper Arm Boom */}
                {/* Heavy Carbon/Titanium Dual Boom */}
                <line
                    x1={j1x}
                    y1={j1y}
                    x2={j2x}
                    y2={j2y}
                    stroke="#262626"
                    strokeWidth="10"
                    strokeLinecap="round"
                />
                <line
                    x1={j1x}
                    y1={j1y}
                    x2={j2x}
                    y2={j2y}
                    stroke="#141414"
                    strokeWidth="6"
                    strokeLinecap="round"
                />
                {/* Arm structural detail wire & accent */}
                <line
                    x1={j1x + 2}
                    y1={j1y - 2}
                    x2={j2x + 2}
                    y2={j2y - 2}
                    stroke="#C6FF3D"
                    strokeWidth="1.5"
                    opacity="0.9"
                />
                <line
                    x1={j1x - 3}
                    y1={j1y + 3}
                    x2={j2x - 3}
                    y2={j2y + 3}
                    stroke="#666"
                    strokeWidth="0.8"
                    strokeDasharray="4 2"
                />

                {/* LINK 2: Forearm Segment */}
                <line
                    x1={j2x}
                    y1={j2y}
                    x2={j3x}
                    y2={j3y}
                    stroke="#222"
                    strokeWidth="7"
                    strokeLinecap="round"
                />
                <line
                    x1={j2x}
                    y1={j2y}
                    x2={j3x}
                    y2={j3y}
                    stroke="#111"
                    strokeWidth="4"
                    strokeLinecap="round"
                />
                <line
                    x1={j2x}
                    y1={j2y}
                    x2={j3x}
                    y2={j3y}
                    stroke="#C6FF3D"
                    strokeWidth="1"
                    strokeDasharray="6 3"
                    opacity="0.75"
                />

                {/* JOINT 1 (Shoulder Pivot Drum) */}
                <circle cx={j1x} cy={j1y} r="8" fill="#1a1a1a" stroke="#505050" strokeWidth="1.2" />
                <circle cx={j1x} cy={j1y} r="5" fill="#2d2d2d" stroke="#C6FF3D" strokeWidth="0.8" />
                <circle cx={j1x} cy={j1y} r="2" fill="#C6FF3D" />

                {/* JOINT 2 (Elbow Actuator Pivot Drum) */}
                <circle cx={j2x} cy={j2y} r="7" fill="#1a1a1a" stroke="#505050" strokeWidth="1.2" />
                <circle cx={j2x} cy={j2y} r="4" fill="#2d2d2d" stroke="#C6FF3D" strokeWidth="0.8" />
                <circle cx={j2x} cy={j2y} r="1.5" fill="#fff" />

                {/* JOINT 3 (Wrist Gimbal Pivot) */}
                <circle cx={j3x} cy={j3y} r="5" fill="#222" stroke="#666" strokeWidth="1" />
                <circle cx={j3x} cy={j3y} r="2.5" fill="#C6FF3D" />

                {/* END-EFFECTOR: Tactical Surveillance & Threat Neutralization Turret */}
                <g transform={`translate(${j3x}, ${j3y}) rotate(${(headAngle * 180) / Math.PI})`}>
                    {/* Gimbal yoke bracket */}
                    <path d="M 0 -7 L 8 -5 L 12 -2 L 12 2 L 8 5 L 0 7 Z" fill="#282828" stroke="#4a4a4a" strokeWidth="0.8" />

                    {/* Optical FLIR / Thermal Sensor Pod */}
                    <rect x="6" y="-6" width="16" height="12" fill="#141414" stroke="#C6FF3D" strokeWidth="1" rx="2" />
                    
                    {/* Primary Optical Lens */}
                    <circle cx="18" cy="0" r="4.5" fill="#0d2b10" stroke="#C6FF3D" strokeWidth="1" />
                    <circle cx="18" cy="0" r="2.5" fill="#C6FF3D" opacity={0.8 + Math.sin(phase * 5) * 0.2} />

                    {/* Top Mounted Rotating LIDAR Scanner Dome */}
                    <ellipse cx="12" cy="-8" rx="5" ry="2" fill="#222" stroke="#3b82f6" strokeWidth="0.6" />
                    <line x1="12" y1="-8" x2="16" y2="-9" stroke="#3b82f6" strokeWidth="0.8" />

                    {/* Dual Laser Targeting Emitters */}
                    <circle cx="22" cy="-3.5" r="1.2" fill="#ff3b30" />
                    <circle cx="22" cy="3.5" r="1.2" fill="#C6FF3D" />
                </g>

                {/* 6. Tactical Telemetry & Sentry HUD Overlays */}
                {/* Joint Kinematics HUD Panel (Top Left) */}
                <g transform="translate(14, 14)">
                    <rect width="118" height="74" fill="rgba(8,8,8,0.88)" stroke="#222" strokeWidth="0.8" rx="2" />
                    <rect width="118" height="15" fill="#141414" rx="2" />
                    <text x="6" y="11" fill="#C6FF3D" fontSize="6.5" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                        &gt;ARM_KINEMATICS
                    </text>

                    {/* Joint 1 */}
                    <text x="8" y="27" fill="#777" fontSize="6" fontFamily="'JetBrains Mono', monospace">J1 AZIMUTH</text>
                    <text x="110" y="27" textAnchor="end" fill="#fff" fontSize="6.5" fontFamily="'JetBrains Mono', monospace">{j1Deg}°</text>
                    
                    {/* Joint 2 */}
                    <text x="8" y="39" fill="#777" fontSize="6" fontFamily="'JetBrains Mono', monospace">J2 PITCH</text>
                    <text x="110" y="39" textAnchor="end" fill="#fff" fontSize="6.5" fontFamily="'JetBrains Mono', monospace">{j2Deg}°</text>

                    {/* Joint 3 */}
                    <text x="8" y="51" fill="#777" fontSize="6" fontFamily="'JetBrains Mono', monospace">J3 WRIST</text>
                    <text x="110" y="51" textAnchor="end" fill="#C6FF3D" fontSize="6.5" fontFamily="'JetBrains Mono', monospace">{j3Deg}°</text>

                    {/* Torque load bar */}
                    <text x="8" y="63" fill="#777" fontSize="5.5" fontFamily="'JetBrains Mono', monospace">TORQUE</text>
                    <text x="110" y="63" textAnchor="end" fill="#a0a0a0" fontSize="5.5" fontFamily="'JetBrains Mono', monospace">{torqueLoad} Nm</text>
                    <rect x="8" y="67" width="102" height="2.5" fill="#1c1c1c" rx="1" />
                    <rect x="8" y="67" width="58" height="2.5" fill="#C6FF3D" rx="1" />
                </g>

                {/* Sentry Status HUD (Bottom Left) */}
                <g transform="translate(14, 258)">
                    <rect width="112" height="50" fill="rgba(8,8,8,0.88)" stroke="#222" strokeWidth="0.8" rx="2" />
                    <circle cx="12" cy="14" r="3" fill="#C6FF3D">
                        <animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                    <text x="20" y="16" fill="#C6FF3D" fontSize="7" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                        DEFENSE SENTRY
                    </text>
                    <text x="10" y="29" fill="#888" fontSize="6" fontFamily="'JetBrains Mono', monospace">
                        MISSION: BORDER_PATROL
                    </text>
                    <text x="10" y="40" fill="#a0a0a0" fontSize="5.5" fontFamily="'JetBrains Mono', monospace">
                        STATUS: {mousePos ? "MANUAL_TARGETING" : "AUTO_SCANNING"}
                    </text>
                </g>

                {/* Threat Prevention Telemetry Box (Bottom Right) */}
                <g transform="translate(348, 240)">
                    <rect width="118" height="68" fill="rgba(8,8,8,0.9)" stroke="#ff3b30" strokeWidth="0.8" rx="2" opacity="0.9" />
                    <rect width="118" height="15" fill="rgba(255, 59, 48, 0.15)" rx="2" />
                    <text x="6" y="11" fill="#ff453a" fontSize="6.5" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">
                        ▲ THREAT_INTERCEPT
                    </text>
                    
                    <text x="8" y="27" fill="#888" fontSize="6" fontFamily="'JetBrains Mono', monospace">PREDICTED BREACH</text>
                    <text x="110" y="27" textAnchor="end" fill="#ff453a" fontSize="6.5" fontWeight="bold" fontFamily="'JetBrains Mono', monospace">00:14s</text>

                    <line x1="8" y1="32" x2="110" y2="32" stroke="#222" strokeWidth="0.5" />

                    <text x="8" y="43" fill="#888" fontSize="6" fontFamily="'JetBrains Mono', monospace">INTERCEPT ACTION</text>
                    <text x="110" y="43" textAnchor="end" fill="#C6FF3D" fontSize="6.5" fontFamily="'JetBrains Mono', monospace">ENGAGED</text>

                    <line x1="8" y1="48" x2="110" y2="48" stroke="#222" strokeWidth="0.5" />

                    <text x="8" y="59" fill="#888" fontSize="6" fontFamily="'JetBrains Mono', monospace">ARM RESPONSE</text>
                    <text x="110" y="59" textAnchor="end" fill="#fff" fontSize="6.5" fontFamily="'JetBrains Mono', monospace">&lt; 12ms</text>
                </g>

                {/* Tactical Corner Reticles */}
                <path d="M 8 20 L 8 8 L 20 8" fill="none" stroke="#C6FF3D" strokeWidth="1.8" />
                <path d="M 472 20 L 472 8 L 460 8" fill="none" stroke="#C6FF3D" strokeWidth="1.8" />
                <path d="M 8 300 L 8 312 L 20 312" fill="none" stroke="#C6FF3D" strokeWidth="1.8" />
                <path d="M 472 300 L 472 312 L 460 312" fill="none" stroke="#C6FF3D" strokeWidth="1.8" />

                {/* Subtitle / Interactive helper */}
                <text x="240" y="312" textAnchor="middle" fill="#444" fontSize="5.5" fontFamily="'JetBrains Mono', monospace">
                    [HOVER TO AIM ARM // CONTINUOUS INVERSE KINEMATICS ACTIVE]
                </text>
            </svg>
        </div>
    );
}
