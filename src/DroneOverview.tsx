import { useEffect, useRef, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Move3d, RotateCw, RotateCcw, Database, RefreshCw } from "lucide-react";
import type { TelemetryData } from "./types/api";
import RoverArmViewer from "./RoverArmViewer";



function SoundWaveVisualizer({ tick, liveSnd }: { tick: number; liveSnd?: number }) {
    const barCount = 18;
    const baseAdc = (liveSnd !== undefined && liveSnd !== null && liveSnd >= 0) ? liveSnd : 820;
    const soundAdc = Math.min(4095, Math.max(0, Math.round(
        baseAdc + (baseAdc > 0 ? (Math.sin(tick * 0.12) * 20 + Math.cos(tick * 0.07) * 15) : 0)
    )));
    const dbValue = (-48 + (soundAdc / 4095) * 42).toFixed(1);

    const bars = Array.from({ length: barCount }, (_, i) => {
        const centerFactor = 1 - Math.abs(i - barCount / 2) / (barCount / 2);
        const w1 = Math.sin((tick * 0.14) + i * 0.42);
        const w2 = Math.cos((tick * 0.09) - i * 0.31);
        const w3 = Math.sin((tick * 0.25) + i * 0.85);
        const raw = (w1 * 0.42 + w2 * 0.33 + w3 * 0.25 + 1) / 2;
        const h = Math.max(5, Math.min(62, raw * 58 * (0.35 + centerFactor * 0.8)));
        const peakH = Math.min(68, h + 3 + ((i * 3 + tick) % 5));
        return { h, peakH };
    });

    return (
        <div className="w-full h-full flex flex-col justify-between select-none">
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-[#222]">
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D] animate-pulse" />
                    <span className="text-[10px] tracking-wider font-semibold text-[#bbb]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        ACOUSTIC // SND
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-[#C6FF3D]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {soundAdc}
                    </span>
                    <span className="text-[9px] text-[#555]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        ADC
                    </span>
                </div>
            </div>

            {/* Waveform Equalizer SVG */}
            <div className="flex-1 my-1 flex items-center justify-center">
                <svg viewBox="0 0 160 74" className="w-full h-full max-h-[82px]" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="soundBarGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#C6FF3D" />
                            <stop offset="45%" stopColor="#22c55e" />
                            <stop offset="100%" stopColor="#0284c7" />
                        </linearGradient>
                    </defs>

                    {/* Background Grid Lines */}
                    <line x1="0" y1="16" x2="160" y2="16" stroke="#1f1f1f" strokeWidth="0.8" strokeDasharray="2 3" />
                    <line x1="0" y1="36" x2="160" y2="36" stroke="#1f1f1f" strokeWidth="0.8" strokeDasharray="2 3" />
                    <line x1="0" y1="56" x2="160" y2="56" stroke="#1f1f1f" strokeWidth="0.8" strokeDasharray="2 3" />

                    {/* Threat threshold line */}
                    <line x1="0" y1="14" x2="160" y2="14" stroke="#e8543f" strokeWidth="0.7" strokeDasharray="3 3" opacity="0.65" />
                    <text x="158" y="11" textAnchor="end" fontSize="5.5" fill="#e8543f" opacity="0.85" fontFamily="'JetBrains Mono', monospace">
                        THRESHOLD 2800
                    </text>

                    {/* Equalizer Bars */}
                    {bars.map((bar, idx) => {
                        const barW = 5.2;
                        const gap = 3.5;
                        const x = 3 + idx * (barW + gap);
                        const y = 70 - bar.h;
                        const peakY = 70 - bar.peakH;

                        return (
                            <g key={idx}>
                                <rect
                                    x={x}
                                    y={y}
                                    width={barW}
                                    height={bar.h}
                                    rx="1"
                                    fill="url(#soundBarGrad)"
                                    opacity="0.9"
                                />
                                <rect
                                    x={x}
                                    y={peakY}
                                    width={barW}
                                    height="1.5"
                                    rx="0.5"
                                    fill="#C6FF3D"
                                />
                            </g>
                        );
                    })}

                    <line x1="0" y1="71" x2="160" y2="71" stroke="#333" strokeWidth="1" />
                </svg>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a] text-[9px] text-[#666]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <span>20Hz–20kHz</span>
                <span className="text-[#888]">{dbValue} dB</span>
            </div>
        </div>
    );
}

function CompassRoseGraphic({ tick, liveSats }: { tick: number; liveSats?: number }) {
    const heading = (tick * 0.35 + 42) % 360;
    const hdgInt = Math.round(heading);

    let cardinal = "N";
    if (hdgInt >= 23 && hdgInt < 68) cardinal = "NE";
    else if (hdgInt >= 68 && hdgInt < 113) cardinal = "E";
    else if (hdgInt >= 113 && hdgInt < 158) cardinal = "SE";
    else if (hdgInt >= 158 && hdgInt < 203) cardinal = "S";
    else if (hdgInt >= 203 && hdgInt < 248) cardinal = "SW";
    else if (hdgInt >= 248 && hdgInt < 293) cardinal = "W";
    else if (hdgInt >= 293 && hdgInt < 338) cardinal = "NW";

    const cx = 46, cy = 46, r = 38;

    return (
        <div className="w-full h-full flex flex-col justify-between select-none">
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-[#222]">
                <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-pulse" />
                    <span className="text-[10px] tracking-wider font-semibold text-[#bbb]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        BEARING // HDG
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-[#38bdf8]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {String(hdgInt).padStart(3, "0")}°
                    </span>
                    <span className="text-[9px] font-semibold text-[#C6FF3D]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {cardinal}
                    </span>
                </div>
            </div>

            {/* Main Content: Compass Dial + Side Telemetry */}
            <div className="flex-1 my-1 flex items-center justify-between gap-2">
                {/* Dial SVG */}
                <div className="w-24 h-24 flex-shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 92 92" className="w-full h-full">
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#262626" strokeWidth="1" />
                        <circle cx={cx} cy={cy} r={r - 4} fill="#0d0d0d" stroke="#1c1c1c" strokeWidth="0.8" />
                        <circle cx={cx} cy={cy} r={r - 12} fill="none" stroke="#1f1f1f" strokeWidth="0.6" strokeDasharray="1.5 2" />
                        <circle cx={cx} cy={cy} r={7} fill="#141414" stroke="#333" strokeWidth="0.8" />

                        {/* Degree Ticks */}
                        {Array.from({ length: 24 }, (_, i) => {
                            const deg = i * 15;
                            const isMajor = deg % 90 === 0;
                            const isMid = deg % 45 === 0;
                            const len = isMajor ? 5 : isMid ? 3.5 : 2;
                            const angleRad = (deg * Math.PI) / 180;
                            const x1 = cx + (r - 0.5) * Math.sin(angleRad);
                            const y1 = cy - (r - 0.5) * Math.cos(angleRad);
                            const x2 = cx + (r - len) * Math.sin(angleRad);
                            const y2 = cy - (r - len) * Math.cos(angleRad);
                            return (
                                <line
                                    key={i}
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke={isMajor ? "#777" : "#3a3a3a"}
                                    strokeWidth={isMajor ? 1.2 : 0.7}
                                />
                            );
                        })}

                        {/* Cardinal Labels */}
                        <text x={cx} y={cy - r + 9} textAnchor="middle" dominantBaseline="middle" fontSize="6.5" fontWeight="bold" fill="#C6FF3D" fontFamily="'JetBrains Mono', monospace">
                            N
                        </text>
                        <text x={cx + r - 7.5} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="5.5" fill="#777" fontFamily="'JetBrains Mono', monospace">
                            E
                        </text>
                        <text x={cx} y={cy + r - 7} textAnchor="middle" dominantBaseline="middle" fontSize="5.5" fill="#777" fontFamily="'JetBrains Mono', monospace">
                            S
                        </text>
                        <text x={cx - r + 7.5} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="5.5" fill="#777" fontFamily="'JetBrains Mono', monospace">
                            W
                        </text>

                        {/* Crosshairs */}
                        <line x1={cx - 15} y1={cy} x2={cx + 15} y2={cy} stroke="#222" strokeWidth="0.6" strokeDasharray="2 2" />
                        <line x1={cx} y1={cy - 15} x2={cx} y2={cy + 15} stroke="#222" strokeWidth="0.6" strokeDasharray="2 2" />

                        {/* Rotating needle */}
                        <g transform={`rotate(${heading}, ${cx}, ${cy})`}>
                            <polygon
                                points={`${cx},${cy - r + 13} ${cx - 3.5},${cy - 2} ${cx},${cy - 5} ${cx + 3.5},${cy - 2}`}
                                fill="#38bdf8"
                                stroke="#0284c7"
                                strokeWidth="0.5"
                            />
                            <polygon
                                points={`${cx},${cy + r - 13} ${cx - 3},${cy + 2} ${cx},${cy + 5} ${cx + 3},${cy + 2}`}
                                fill="#334155"
                                stroke="#1e293b"
                                strokeWidth="0.5"
                            />
                            <circle cx={cx} cy={cy} r="3" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
                            <circle cx={cx} cy={cy} r="1" fill="#C6FF3D" />
                        </g>
                    </svg>
                </div>

                {/* Right side telemetry HUD */}
                <div className="flex-1 flex flex-col justify-center gap-1.5 pl-2 border-l border-[#1f1f1f] text-[9px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <div className="flex justify-between items-center text-[#777]">
                        <span>WP LOCK</span>
                        <span className="text-[#38bdf8] font-bold">WP-01</span>
                    </div>
                    <div className="flex justify-between items-center text-[#777]">
                        <span>DIST TO WP</span>
                        <span className="text-[#c0c0c0]">18.4 m</span>
                    </div>
                    <div className="flex justify-between items-center text-[#777]">
                        <span>STEER CORR</span>
                        <span className="text-[#C6FF3D]">+1.2°</span>
                    </div>
                    <div className="w-full bg-[#161616] h-1.5 rounded overflow-hidden mt-0.5">
                        <div className="bg-[#38bdf8] h-full" style={{ width: `${(heading / 360) * 100}%` }} />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a] text-[9px] text-[#666]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <span>GPS FIX: {liveSats && liveSats > 0 ? "3D LOCK" : "STANDBY"}</span>
                <span className="text-[#888]">SATS: {liveSats !== undefined ? liveSats : 9} LOCK</span>
            </div>
        </div>
    );
}

function FlameSensorMatrix({ tick, liveFlame }: { tick: number; liveFlame?: number }) {
    const baseFlame = (liveFlame !== undefined && liveFlame !== null) ? liveFlame : 3750;
    const flameAdc = Math.round(baseFlame - Math.sin(tick * 0.08) * 15 - Math.cos(tick * 0.14) * 10);
    const isThreat = flameAdc < 1500;

    const gridSize = 6;
    const cells = Array.from({ length: gridSize * gridSize }, (_, i) => {
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;
        const distFromCenter = Math.sqrt(Math.pow(row - 2.5, 2) + Math.pow(col - 2.5, 2));
        const shimmer = Math.sin(tick * 0.12 + i * 0.65) * 0.5 + 0.5;
        const heat = Math.max(0, Math.min(1, 0.1 + (1 - distFromCenter / 3.8) * 0.25 + shimmer * 0.2));
        return { row, col, heat };
    });

    return (
        <div className="w-full h-full flex flex-col justify-between select-none">
            {/* Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-[#222]">
                <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isThreat ? "bg-[#e8543f] animate-ping" : "bg-[#22c55e] animate-pulse"}`} />
                    <span className="text-[10px] tracking-wider font-semibold text-[#bbb]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        FLAME IR // SENSOR
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isThreat ? "text-[#e8543f]" : "text-[#22c55e]"}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {flameAdc}
                    </span>
                    <span className="text-[9px] text-[#555]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        ADC
                    </span>
                </div>
            </div>

            {/* Main Content: Thermal Grid + Threat Telemetry */}
            <div className="flex-1 my-1 flex items-center justify-between gap-2">
                {/* Grid SVG */}
                <div className="w-24 h-24 flex-shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 76 76" className="w-full h-full">
                        <defs>
                            <radialGradient id="matrixHeatGlow" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
                                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                            </radialGradient>
                        </defs>

                        <rect x="2" y="2" width="72" height="72" fill="url(#matrixHeatGlow)" rx="3" />

                        {cells.map((cell, idx) => {
                            const cellSize = 8;
                            const gap = 2;
                            const startX = 8;
                            const startY = 8;
                            const x = startX + cell.col * (cellSize + gap);
                            const y = startY + cell.row * (cellSize + gap);

                            const bgFill = cell.heat > 0.42
                                ? `rgba(34, 197, 94, ${0.14 + cell.heat * 0.3})`
                                : "rgba(22, 22, 22, 0.9)";
                            const strokeColor = cell.heat > 0.42 ? "rgba(74, 222, 128, 0.35)" : "#222";

                            return (
                                <rect
                                    key={idx}
                                    x={x}
                                    y={y}
                                    width={cellSize}
                                    height={cellSize}
                                    rx="1.2"
                                    fill={bgFill}
                                    stroke={strokeColor}
                                    strokeWidth="0.5"
                                />
                            );
                        })}

                        <circle cx="38" cy="38" r="14" fill="none" stroke="#C6FF3D" strokeWidth="0.6" strokeDasharray="1.5 2" opacity="0.45" />
                        <line x1="8" y1="38" x2="68" y2="38" stroke="#2a2a2a" strokeWidth="0.5" strokeDasharray="1 3" />
                        <line x1="38" y1="8" x2="38" y2="68" stroke="#2a2a2a" strokeWidth="0.5" strokeDasharray="1 3" />
                    </svg>
                </div>

                {/* Right side telemetry HUD */}
                <div className="flex-1 flex flex-col justify-center gap-1.5 pl-2 border-l border-[#1f1f1f] text-[9px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <div className="flex justify-between items-center text-[#777]">
                        <span>BAND</span>
                        <span className="text-[#c0c0c0]">760–1100nm</span>
                    </div>
                    <div className="flex justify-between items-center text-[#777]">
                        <span>THRESHOLD</span>
                        <span className="text-[#e8543f]">1500 ADC</span>
                    </div>
                    <div className="flex justify-between items-center text-[#777]">
                        <span>DELTA</span>
                        <span className="text-[#22c55e]">+{flameAdc - 1500}</span>
                    </div>
                    {/* Calibration bar */}
                    <div className="w-full bg-[#161616] h-1.5 rounded overflow-hidden mt-0.5 relative">
                        <div
                            className={`h-full ${isThreat ? "bg-[#e8543f]" : "bg-[#22c55e]"}`}
                            style={{ width: `${Math.min(100, (flameAdc / 4095) * 100)}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1 border-t border-[#1a1a1a] text-[9px] text-[#666]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <span>STATUS: {isThreat ? "FIRE ALERT" : "CLEAR"}</span>
                <span className={isThreat ? "text-[#e8543f] font-bold" : "text-[#22c55e]"}>SECURE</span>
            </div>
        </div>
    );
}

function EngineTopFace() {
    return (
        <svg viewBox="0 0 260 160" style={{ width: "100%", height: "100%", display: "block" }}>
            <rect width="260" height="160" fill="#151515" />
            <rect x="10" y="10" width="240" height="140" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" rx="4" />
            <rect x="30" y="20" width="200" height="120" fill="none" stroke="#333" strokeWidth="1" rx="2" />
            {[0,1,2,3,4].map(i => (
                <g key={`tb${i}`}>
                    <circle cx={50+i*42} cy={50} r="14" fill="#0d0d0d" stroke="#C6FF3D" strokeWidth="0.8" opacity="0.7" />
                    <circle cx={50+i*42} cy={50} r="5" fill="none" stroke="#444" strokeWidth="0.5" />
                    <circle cx={50+i*42} cy={110} r="14" fill="#0d0d0d" stroke="#C6FF3D" strokeWidth="0.8" opacity="0.7" />
                    <circle cx={50+i*42} cy={110} r="5" fill="none" stroke="#444" strokeWidth="0.5" />
                </g>
            ))}
            {[0,1,2,3,4,5].map(i => (
                <circle key={`bolt${i}`} cx={35+i*40} cy={80} r="2.5" fill="#333" stroke="#555" strokeWidth="0.5" />
            ))}
            <text x="130" y="155" textAnchor="middle" fontSize="7" fill="#555" fontFamily="'JetBrains Mono', monospace">TOP VIEW — CYLINDER BORES</text>
        </svg>
    );
}

function EngineBottomFace() {
    return (
        <svg viewBox="0 0 260 160" style={{ width: "100%", height: "100%", display: "block" }}>
            <rect width="260" height="160" fill="#111" />
            <rect x="20" y="15" width="220" height="130" fill="#151515" stroke="#444" strokeWidth="1.5" rx="3" />
            {[0,1,2,3,4,5,6].map(i => (
                <line key={`r${i}`} x1="30" y1={25+i*18} x2="230" y2={25+i*18} stroke="#2a2a2a" strokeWidth="1" />
            ))}
            <circle cx="130" cy="80" r="8" fill="#222" stroke="#666" strokeWidth="1.5" />
            <circle cx="130" cy="80" r="3" fill="#333" />
            {[0,1,2,3,4,5,6,7,8,9].map(i => (
                <circle key={`sb${i}`} cx={35+i*20} cy={20} r="1.5" fill="#444" />
            ))}
            {[0,1,2,3,4,5,6,7,8,9].map(i => (
                <circle key={`sb2${i}`} cx={35+i*20} cy={140} r="1.5" fill="#444" />
            ))}
            <text x="130" y="155" textAnchor="middle" fontSize="7" fill="#555" fontFamily="'JetBrains Mono', monospace">BOTTOM VIEW — OIL PAN</text>
        </svg>
    );
}

function EngineFrontFace() {
    return (
        <svg viewBox="0 0 260 160" style={{ width: "100%", height: "100%", display: "block" }}>
            <rect width="260" height="160" fill="#131313" />
            <rect x="30" y="10" width="200" height="130" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" rx="3" />
            <rect x="50" y="15" width="160" height="80" fill="#161616" stroke="#555" strokeWidth="1" rx="2" />
            <circle cx="100" cy="50" r="22" fill="none" stroke="#555" strokeWidth="1.5" />
            <circle cx="100" cy="50" r="8" fill="#222" stroke="#666" strokeWidth="1" />
            <circle cx="160" cy="50" r="22" fill="none" stroke="#555" strokeWidth="1.5" />
            <circle cx="160" cy="50" r="8" fill="#222" stroke="#666" strokeWidth="1" />
            <circle cx="130" cy="110" r="18" fill="none" stroke="#C6FF3D" strokeWidth="1" opacity="0.5" />
            <circle cx="130" cy="110" r="6" fill="#333" stroke="#666" strokeWidth="1" />
            <path d="M100,72 Q100,90 112,110" fill="none" stroke="#888" strokeWidth="1.5" />
            <path d="M160,72 Q160,90 148,110" fill="none" stroke="#888" strokeWidth="1.5" />
            <path d="M100,28 L160,28" fill="none" stroke="#888" strokeWidth="1.5" />
            <circle cx="80" cy="120" r="10" fill="#181818" stroke="#555" strokeWidth="1" />
            <circle cx="80" cy="120" r="3" fill="#3a6a8a" />
            <text x="130" y="155" textAnchor="middle" fontSize="7" fill="#555" fontFamily="'JetBrains Mono', monospace">FRONT VIEW — TIMING / PULLEYS</text>
        </svg>
    );
}

function EngineBackFace() {
    return (
        <svg viewBox="0 0 260 160" style={{ width: "100%", height: "100%", display: "block" }}>
            <rect width="260" height="160" fill="#131313" />
            <rect x="40" y="10" width="180" height="130" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" rx="3" />
            <circle cx="130" cy="75" r="55" fill="none" stroke="#444" strokeWidth="1.5" />
            <circle cx="130" cy="75" r="48" fill="#151515" stroke="#333" strokeWidth="1" />
            <circle cx="130" cy="75" r="38" fill="none" stroke="#C6FF3D" strokeWidth="1" opacity="0.4" />
            <circle cx="130" cy="75" r="30" fill="#111" stroke="#555" strokeWidth="1" />
            {[0,1,2,3,4,5].map(i => {
                const a = (i * 60 * Math.PI) / 180;
                return <circle key={`fb${i}`} cx={130 + 24 * Math.cos(a)} cy={75 + 24 * Math.sin(a)} r="2.5" fill="#333" stroke="#555" strokeWidth="0.5" />;
            })}
            <circle cx="130" cy="75" r="8" fill="#222" stroke="#666" strokeWidth="1.5" />
            <circle cx="130" cy="75" r="3" fill="#444" />
            <circle cx="130" cy="75" r="5" fill="none" stroke="#777" strokeWidth="0.5" />
            <text x="130" y="155" textAnchor="middle" fontSize="7" fill="#555" fontFamily="'JetBrains Mono', monospace">REAR VIEW — FLYWHEEL</text>
        </svg>
    );
}

function EngineLeftFace() {
    return (
        <svg viewBox="0 0 160 160" style={{ width: "100%", height: "100%", display: "block" }}>
            <rect width="160" height="160" fill="#131313" />
            <rect x="10" y="10" width="140" height="110" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" rx="3" />
            <line x1="10" y1="35" x2="150" y2="35" stroke="#555" strokeWidth="1" strokeDasharray="4 2" />
            {[0,1,2,3,4].map(i => (
                <g key={`ep${i}`}>
                    <rect x="145" y={15+i*20} width="10" height="12" fill="#111" stroke="#e8543f" strokeWidth="0.8" rx="1" opacity="0.6" />
                    <line x1="155" y1={21+i*20} x2="160" y2={21+i*20} stroke="#e8543f" strokeWidth="1" opacity="0.4" />
                </g>
            ))}
            <path d="M155,21 Q165,21 168,40 Q170,60 168,80 Q165,100 155,101" fill="none" stroke="#e8543f" strokeWidth="1.5" opacity="0.4" />
            <rect x="15" y="40" width="130" height="75" fill="none" stroke="#2a2a2a" strokeWidth="0.5" />
            <rect x="20" y="118" width="120" height="15" fill="#151515" stroke="#444" strokeWidth="1" rx="2" />
            <circle cx="40" cy="100" r="10" fill="#181818" stroke="#555" strokeWidth="1" />
            <circle cx="40" cy="100" r="3" fill="#333" />
            <text x="80" y="155" textAnchor="middle" fontSize="7" fill="#555" fontFamily="'JetBrains Mono', monospace">LEFT — EXHAUST SIDE</text>
        </svg>
    );
}

function EngineRightFace() {
    return (
        <svg viewBox="0 0 160 160" style={{ width: "100%", height: "100%", display: "block" }}>
            <rect width="160" height="160" fill="#131313" />
            <rect x="10" y="10" width="140" height="110" fill="#1a1a1a" stroke="#444" strokeWidth="1.5" rx="3" />
            <line x1="10" y1="35" x2="150" y2="35" stroke="#555" strokeWidth="1" strokeDasharray="4 2" />
            {[0,1,2,3,4].map(i => (
                <g key={`ir${i}`}>
                    <rect x="-5" y={15+i*20} width="18" height="10" fill="#111" stroke="#3b82f6" strokeWidth="0.8" rx="1" opacity="0.6" />
                    <line x1="-5" y1={20+i*20} x2="-10" y2={20+i*20} stroke="#3b82f6" strokeWidth="1" opacity="0.4" />
                </g>
            ))}
            <path d="M5,21 Q-5,21 -8,40 Q-10,60 -8,80 Q-5,100 5,101" fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.4" />
            <rect x="15" y="40" width="130" height="75" fill="none" stroke="#2a2a2a" strokeWidth="0.5" />
            <rect x="20" y="118" width="120" height="15" fill="#151515" stroke="#444" strokeWidth="1" rx="2" />
            <rect x="100" y="85" width="30" height="18" fill="#181818" stroke="#555" strokeWidth="1" rx="3" />
            <circle cx="115" cy="94" r="5" fill="#222" stroke="#666" strokeWidth="0.8" />
            <text x="80" y="155" textAnchor="middle" fontSize="7" fill="#555" fontFamily="'JetBrains Mono', monospace">RIGHT — INTAKE SIDE</text>
        </svg>
    );
}

export function Engine360Viewer() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [rotX, setRotX] = useState(-25);
    const [rotY, setRotY] = useState(35);
    const [isDragging, setIsDragging] = useState(false);
    const [autoRotate, setAutoRotate] = useState(true);
    const dragStart = useRef({ x: 0, y: 0, rotX: 0, rotY: 0 });

    useEffect(() => {
        if (!autoRotate || isDragging) return;
        const id = setInterval(() => {
            setRotY(prev => prev + 0.3);
        }, 30);
        return () => clearInterval(id);
    }, [autoRotate, isDragging]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        setIsDragging(true);
        setAutoRotate(false);
        dragStart.current = { x: e.clientX, y: e.clientY, rotX, rotY };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [rotX, rotY]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setRotY(dragStart.current.rotY + dx * 0.5);
        setRotX(Math.max(-80, Math.min(80, dragStart.current.rotX - dy * 0.5)));
    }, [isDragging]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    const resetView = () => {
        setRotX(-25);
        setRotY(35);
        setAutoRotate(true);
    };

    const normalizedY = ((rotY % 360) + 360) % 360;
    let faceLabel = "FRONT";
    if (normalizedY >= 45 && normalizedY < 135) faceLabel = "RIGHT";
    else if (normalizedY >= 135 && normalizedY < 225) faceLabel = "REAR";
    else if (normalizedY >= 225 && normalizedY < 315) faceLabel = "LEFT";

    const W = 260, H = 160, D = 160;
    const halfW = W / 2, halfH = H / 2, halfD = D / 2;

    return (
        <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
                width: "100%", height: "100%", position: "relative",
                cursor: isDragging ? "grabbing" : "grab",
                userSelect: "none", touchAction: "none",
                perspective: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
            }}
        >
            <div style={{
                width: W, height: H, position: "relative",
                transformStyle: "preserve-3d",
                transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                transition: isDragging ? "none" : "transform 0.05s linear",
            }}>
                <div style={{
                    position: "absolute", width: W, height: H,
                    transform: `translateZ(${halfD}px)`,
                    backfaceVisibility: "hidden",
                }}>
                    <EngineFrontFace />
                </div>
                <div style={{
                    position: "absolute", width: W, height: H,
                    transform: `translateZ(${-halfD}px) rotateY(180deg)`,
                    backfaceVisibility: "hidden",
                }}>
                    <EngineBackFace />
                </div>
                <div style={{
                    position: "absolute", width: D, height: H,
                    left: (W - D) / 2,
                    transform: `translateX(${-halfD}px) rotateY(-90deg)`,
                    transformOrigin: `${halfD}px ${halfH}px`,
                    backfaceVisibility: "hidden",
                }}>
                    <EngineLeftFace />
                </div>
                <div style={{
                    position: "absolute", width: D, height: H,
                    left: (W - D) / 2,
                    transform: `translateX(${halfD}px) rotateY(90deg)`,
                    transformOrigin: `${halfD}px ${halfH}px`,
                    backfaceVisibility: "hidden",
                }}>
                    <EngineRightFace />
                </div>
                <div style={{
                    position: "absolute", width: W, height: D,
                    top: (H - D) / 2,
                    transform: `translateY(${-halfD}px) rotateX(90deg)`,
                    transformOrigin: `${halfW}px ${halfD}px`,
                    backfaceVisibility: "hidden",
                }}>
                    <EngineTopFace />
                </div>
                <div style={{
                    position: "absolute", width: W, height: D,
                    top: (H - D) / 2,
                    transform: `translateY(${halfD}px) rotateX(-90deg)`,
                    transformOrigin: `${halfW}px ${halfD}px`,
                    backfaceVisibility: "hidden",
                }}>
                    <EngineBottomFace />
                </div>
            </div>

            <div style={{
                position: "absolute", bottom: 6, left: 8, zIndex: 10,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#C6FF3D",
                background: "rgba(5,5,5,0.8)", padding: "3px 8px",
                border: "1px solid rgba(198,255,61,0.2)",
                display: "flex", alignItems: "center", gap: 6,
            }}>
                <Move3d size={10} />
                <span>X:{Math.round(rotX)}° Y:{Math.round(normalizedY)}°</span>
                <span style={{ color: "#888", marginLeft: 4 }}>|</span>
                <span style={{ color: "#fff" }}>{faceLabel}</span>
            </div>

            <div style={{
                position: "absolute", top: 6, right: 8, zIndex: 10,
                display: "flex", gap: 4,
            }}>
                <button
                    onClick={(e) => { e.stopPropagation(); setAutoRotate(!autoRotate); }}
                    style={{
                        background: autoRotate ? "rgba(198,255,61,0.15)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${autoRotate ? "rgba(198,255,61,0.4)" : "#333"}`,
                        color: autoRotate ? "#C6FF3D" : "#666",
                        padding: "3px 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    }}
                >
                    <RotateCw size={10} /> {autoRotate ? "AUTO" : "MANUAL"}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); resetView(); }}
                    style={{
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid #333",
                        color: "#888", padding: "3px 6px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 3,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
                    }}
                >
                    <RotateCcw size={10} /> RESET
                </button>
            </div>

            <div style={{
                position: "absolute", bottom: 6, right: 8, zIndex: 10,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "#555",
            }}>
                DRAG TO ROTATE
            </div>
        </div>
    );
}


function TelemetryCell({
        label,
        value,
        unit,
        color = "#fff",
        warn = false
    }: {
        label: string;
        value: string | number;
        unit: string;
        color?: string;
        warn?: boolean;
    }) {
    return (
        <div
            className="px-4 py-3"
            style={{
                border: `1px solid ${warn ? "rgba(232,84,63,0.5)" : "#3a3a3a"}`,
                borderRadius: 6,
                background: warn ? "rgba(232,84,63,0.07)" : "#0a0a0a",
            }}
        >
            <div
                className="text-xs mb-1.5 font-semibold"
                style={{
                    color: warn ? "#e8543f" : "#c0c0c0",
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: 1,
                }}
            >
                {label}
            </div>

            <div className="flex items-baseline gap-1.5">
                <span
                    className="text-lg font-semibold"
                    style={{
                        color,
                        fontFamily: "'Space Grotesk', sans-serif",
                    }}
                >
                    {value}
                </span>

                <span
                    className="text-xs"
                    style={{
                        color: "#b0b0b0",
                        fontFamily: "'JetBrains Mono', monospace",
                    }}
                >
                    {unit}
                </span>
            </div>
        </div>
    );
}

interface ThreatLogRecord {
    threat_number: number;
    date_time: string;
    threat_level: "WATCH" | "ALERT" | "FIRE" | "CRITICAL";
    threat_type: string;
    threat_score: number;
    trigger_sensors: string[];
    obstacle_dist_cm?: number;
    acoustic_snd_adc?: number;
    metal_detected?: boolean;
    flame_ir_adc?: number;
    ambient_temp_c?: number;
    humidity_pct?: number;
    lora_rssi_dbm?: number;
    patrol_mode?: string;
    threat_summary?: string;
}

interface ThreatStats {
    total_threats: number;
    latest_threat_number: number;
    by_level: Record<string, number>;
}

export default function DroneOverviewSection({ liveTelemetry: _liveTelemetry }: { liveTelemetry?: TelemetryData }) {
    const [tick, setTick] = useState(0);
    const [threats, setThreats] = useState<ThreatLogRecord[]>([]);
    const [stats, setStats] = useState<ThreatStats>({ total_threats: 0, latest_threat_number: 0, by_level: {} });
    const [pgConnected, setPgConnected] = useState<boolean>(true);
    const [roverOnline, setRoverOnline] = useState<boolean>(false);
    const [roverLastPing, setRoverLastPing] = useState<string>("");

    // Rover Telemetry State — dynamically populated from Raspberry Pi http://172.20.10.3:5000/api/state
    const [currentSensors, setCurrentSensors] = useState({
        dist: -1,         // Obstacle distance in cm (-1 = clear / >400cm)
        snd: 0,           // Acoustic sound in ADC
        metal: false,     // Metal detection boolean
        flame: 3200,      // Flame IR in ADC
        sats: 0,          // GPS satellites count
        temp: 22.0,       // Ambient temperature in °C
        hum: 70.0,        // Humidity percentage
        rssi: -84.0,      // LoRa RSSI dBm (persisted default if not present)
        threatLevel: "CLEAR", // Fusion threat level
        patrolMode: "STOP"    // Rover mode / patrol state
    });

    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 60);
        return () => clearInterval(id);
    }, []);

    // 1. Live Telemetry Polling from Raspberry Pi (http://172.20.10.3:5000/api/state via /rover-api/state)
    const fetchRoverTelemetry = useCallback(async () => {
        try {
            let res: Response;
            try {
                res = await fetch("/rover-api/state");
            } catch {
                res = await fetch("http://172.20.10.3:5000/api/state");
            }

            if (res.ok) {
                const data = await res.json();
                setRoverOnline(true);
                setRoverLastPing(new Date().toLocaleTimeString());

                const s = data.sensors || {};
                const g = data.gps || {};
                const l = data.lora || {};

                setCurrentSensors(prev => {
                    const next = { ...prev };

                    // 1. Obstacle distance (cm) - if received, update; else leave previous
                    if (s.dist !== undefined && s.dist !== null) {
                        next.dist = s.dist;
                    }

                    // 2. Acoustic sound (ADC)
                    if (s.snd !== undefined && s.snd !== null) {
                        next.snd = s.snd;
                    }

                    // 3. Metal detection
                    if (s.metal !== undefined && s.metal !== null) {
                        next.metal = Boolean(s.metal) || (Array.isArray(data.mods) && data.mods.includes("metal"));
                    } else if (Array.isArray(data.mods) && data.mods.includes("metal")) {
                        next.metal = true;
                    }

                    // 4. Flame IR (ADC)
                    if (s.flame !== undefined && s.flame !== null) {
                        next.flame = s.flame;
                    }

                    // 5. GPS satellites
                    if (g.sats !== undefined && g.sats !== null) {
                        next.sats = g.sats;
                    }

                    // 6. Ambient temperature (°C)
                    if (s.temp !== undefined && s.temp !== null) {
                        next.temp = s.temp;
                    }

                    // 7. Humidity (%)
                    if (s.hum !== undefined && s.hum !== null) {
                        next.hum = s.hum;
                    }

                    // 8. LoRa RSSI (dBm) - leave rest if not present
                    if (l.rssi !== undefined && l.rssi !== null) {
                        next.rssi = l.rssi;
                    }

                    // 9. Threat Level
                    if (data.level !== undefined && data.level !== null) {
                        next.threatLevel = String(data.level).toUpperCase();
                    }

                    // 10. Patrol Mode
                    if (data.mode !== undefined && data.mode !== null) {
                        next.patrolMode = data.patrol ? "PATROL" : String(data.mode);
                    } else if (data.nav) {
                        next.patrolMode = String(data.nav).slice(0, 10);
                    }

                    return next;
                });
            } else {
                setRoverOnline(false);
            }
        } catch {
            setRoverOnline(false);
        }
    }, []);

    // 2. Polling PostgreSQL threats and stats (audit table only — does NOT overwrite live telemetry)
    const fetchThreatData = useCallback(async () => {
        try {
            const [listRes, statsRes] = await Promise.all([
                fetch("/threat-api/api/threats?limit=15"),
                fetch("/threat-api/api/threats/stats")
            ]);

            if (listRes.ok) {
                const data = await listRes.json();
                setThreats(data);
                setPgConnected(true);
            }
            if (statsRes.ok) {
                const s = await statsRes.json();
                setStats(s);
            }
        } catch {
            setPgConnected(false);
        }
    }, []);

    useEffect(() => {
        fetchRoverTelemetry();
        const roverPoll = setInterval(fetchRoverTelemetry, 750);
        return () => clearInterval(roverPoll);
    }, [fetchRoverTelemetry]);

    useEffect(() => {
        fetchThreatData();
        const pollId = setInterval(fetchThreatData, 3000);
        return () => clearInterval(pollId);
    }, [fetchThreatData]);

    return (
        <section style={{ background: "#0a0a0a", fontFamily: "'Space Grotesk', sans-serif" }} className="relative overflow-hidden">
            <div className="relative z-10 px-6 md:px-10 py-14">
                <div className="flex items-center justify-between mb-8 flex-wrap gap-4 pb-4 border-b border-[#222]">
                    <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#C6FF3D] animate-pulse shadow-[0_0_8px_#C6FF3D]" />
                        <h2 className="text-lg md:text-xl font-bold tracking-wider text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            ROVER SENSOR DASHBOARD
                        </h2>
                        <span className="hidden sm:inline text-xs px-2 py-0.5 font-mono text-[#C6FF3D] bg-[#141414] border border-[#333] rounded">
                            SECTOR-04 BRAVO
                        </span>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111] border border-[#2a2a2a] text-[#888]">
                            <span className={`w-1.5 h-1.5 rounded-full ${roverOnline ? "bg-[#22c55e] animate-pulse" : "bg-[#ef4444]"}`} />
                            <span>ROVER PI (172.20.10.3:5000): <strong className={roverOnline ? "text-white" : "text-[#ef4444]"}>{roverOnline ? (roverLastPing ? `LIVE (${roverLastPing})` : "ONLINE") : "OFFLINE / RETRYING"}</strong></span>
                        </div>
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111] border border-[#2a2a2a] text-[#888]">
                            <span className={`w-1.5 h-1.5 rounded-full ${pgConnected ? "bg-[#22c55e] animate-pulse" : "bg-[#ef4444]"}`} />
                            <span>POSTGRESQL 18: <strong className={pgConnected ? "text-white" : "text-[#ef4444]"}>{pgConnected ? "ONLINE" : "OFFLINE"}</strong></span>
                        </div>
                        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111] border border-[#2a2a2a] text-[#888]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                            <span>DRIVE NODE: <strong className="text-white">{currentSensors.patrolMode}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111] border border-[#2a2a2a] text-[#888]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
                            <span>SURVEILLANCE: <strong className="text-[#C6FF3D]">ACTIVE</strong></span>
                        </div>
                    </div>
                </div>

                <div style={{ overflow: "hidden", background: "#111" }}>
                    
                    <div className="flex" style={{ minHeight: 480 }}>
                        <div className="flex-1 p-4" style={{ background: "#0d0d0d" }}>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 h-full" style={{ gridTemplateRows: "auto 1fr auto" }}>
                                <div className="flex flex-col justify-between p-3" style={{ border: "1px solid #3a3a3a", borderRadius: 6, background: "#0a0a0a", minHeight: 168 }}>
                                    <SoundWaveVisualizer tick={tick} liveSnd={currentSensors.snd} />
                                </div>
                                <div className="flex flex-col justify-between p-3" style={{ border: "1px solid #3a3a3a", borderRadius: 6, background: "#0a0a0a", minHeight: 168 }}>
                                    <CompassRoseGraphic tick={tick} liveSats={currentSensors.sats} />
                                </div>
                                <div className="hidden md:flex flex-col justify-between p-3" style={{ border: "1px solid #3a3a3a", borderRadius: 6, background: "#0a0a0a", minHeight: 168 }}>
                                    <FlameSensorMatrix tick={tick} liveFlame={currentSensors.flame} />
                                </div>
                                <div className="col-span-2 md:col-span-3 flex items-center justify-center p-3"
                                    style={{ border: "1px solid #3a3a3a", borderRadius: 6, background: "#0a0a0a", position: "relative", overflow: "hidden" }}>
                                    <div style={{ width: "100%", height: 420 }}>
                                        <RoverArmViewer height={420} />
                                    </div>
                                </div>
                                
                                {/* ABSR ROVER TELEMETRY CELLS (10 BOXES, 5 COLUMNS) */}
                                <div className="col-span-2 md:col-span-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                                    {/* 1. OBSTACLE DIST */}
                                    <TelemetryCell 
                                        label="OBSTACLE DIST" 
                                        value={
                                            currentSensors.dist === -1 
                                                ? "> 400" 
                                                : currentSensors.dist >= 0 
                                                ? `${currentSensors.dist}` 
                                                : "—"
                                        } 
                                        unit={currentSensors.dist >= 0 ? "cm" : ""} 
                                        warn={currentSensors.dist >= 0 && currentSensors.dist < 40}
                                        color={currentSensors.dist >= 0 && currentSensors.dist < 40 ? "#ef4444" : "#C6FF3D"}
                                    />

                                    {/* 2. ACOUSTIC SND */}
                                    <TelemetryCell 
                                        label="ACOUSTIC SND" 
                                        value={`${currentSensors.snd}`} 
                                        unit="ADC" 
                                        warn={currentSensors.snd > 2500}
                                        color={currentSensors.snd > 2500 ? "#ef4444" : "#ffffff"}
                                    />

                                    {/* 3. METAL SENSOR */}
                                    <TelemetryCell 
                                        label="METAL SENSOR" 
                                        value={currentSensors.metal ? "DETECTED" : "CLEAR"} 
                                        unit="" 
                                        warn={currentSensors.metal}
                                        color={currentSensors.metal ? "#f97316" : "#22c55e"}
                                    />

                                    {/* 4. FLAME IR */}
                                    <TelemetryCell 
                                        label="FLAME IR" 
                                        value={`${currentSensors.flame}`} 
                                        unit="ADC" 
                                        warn={currentSensors.flame < 1500}
                                        color={currentSensors.flame < 1500 ? "#ef4444" : "#C6FF3D"}
                                    />

                                    {/* 5. GPS SATELLITES */}
                                    <TelemetryCell 
                                        label="GPS SATELLITES" 
                                        value={`${currentSensors.sats}`} 
                                        unit={currentSensors.sats > 0 ? "LOCK" : "SEARCH"} 
                                        warn={currentSensors.sats < 4}
                                        color={currentSensors.sats >= 6 ? "#22c55e" : currentSensors.sats > 0 ? "#eab308" : "#888888"}
                                    />

                                    {/* 6. AMBIENT TEMP */}
                                    <TelemetryCell 
                                        label="AMBIENT TEMP" 
                                        value={`${currentSensors.temp}`} 
                                        unit="°C" 
                                        warn={currentSensors.temp > 55 || currentSensors.temp < -15}
                                        color={currentSensors.temp > 55 ? "#ef4444" : "#ffffff"}
                                    />

                                    {/* 7. HUMIDITY */}
                                    <TelemetryCell 
                                        label="HUMIDITY" 
                                        value={`${currentSensors.hum}`} 
                                        unit="%" 
                                        warn={currentSensors.hum > 95}
                                        color="#ffffff"
                                    />

                                    {/* 8. LORA RSSI */}
                                    <TelemetryCell 
                                        label="LORA RSSI" 
                                        value={`${currentSensors.rssi}`} 
                                        unit="dBm" 
                                        warn={currentSensors.rssi < -125}
                                        color={currentSensors.rssi > -105 ? "#22c55e" : "#eab308"}
                                    />

                                    {/* 9. THREAT LEVEL */}
                                    <TelemetryCell 
                                        label="THREAT LEVEL" 
                                        value={currentSensors.threatLevel} 
                                        unit="FUSION" 
                                        warn={currentSensors.threatLevel !== "CLEAR"}
                                        color={
                                            currentSensors.threatLevel === "FIRE" 
                                                ? "#ef4444" 
                                                : currentSensors.threatLevel === "ALERT" 
                                                ? "#f97316" 
                                                : currentSensors.threatLevel === "WATCH" 
                                                ? "#eab308" 
                                                : "#22c55e"
                                        }
                                    />

                                    {/* 10. PATROL MODE */}
                                    <TelemetryCell 
                                        label="PATROL MODE" 
                                        value={currentSensors.patrolMode} 
                                        unit="MODE" 
                                        color="#38bdf8"
                                    />
                                </div>
                                
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── POSTGRESQL 18 THREAT LOGS AUDIT TABLE ─────────────────────────────────── */}
                <div className="mt-8 p-5 bg-[#0d0d0d] border border-[#262626] rounded-lg">
                    <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-[#222]">
                        <div className="flex items-center gap-3">
                            <Database className="w-5 h-5 text-[#C6FF3D]" />
                            <h3 className="text-base font-bold text-white tracking-wider" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                                POSTGRESQL THREAT AUDIT LOGS <span className="text-xs font-mono text-[#888] font-normal">[table: threat_logs]</span>
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#141414] border border-[#333] text-[#C6FF3D]">
                                TOTAL LOGGED: {stats.total_threats}
                            </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <Link
                                to="/threats"
                                className="px-3 py-1 text-xs font-mono rounded bg-[#1f1f1f] border border-[#333] text-[#C6FF3D] hover:border-[#C6FF3D] hover:bg-[#C6FF3D]/10 transition flex items-center gap-1.5"
                            >
                                VIEW FULL ARCHIVE →
                            </Link>
                            <button
                                onClick={fetchThreatData}
                                className="px-2.5 py-1 text-xs font-mono rounded bg-[#1f1f1f] border border-[#333] text-[#ccc] hover:text-white transition flex items-center gap-1"
                                title="Refresh from PostgreSQL"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Refresh
                            </button>
                        </div>
                    </div>

                    {/* Threat Records Table */}
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono border-collapse">
                            <thead>
                                <tr className="border-b border-[#222] text-[#777]">
                                    <th className="py-2.5 px-3">THREAT #</th>
                                    <th className="py-2.5 px-3">DATE & TIME</th>
                                    <th className="py-2.5 px-3">LEVEL</th>
                                    <th className="py-2.5 px-3">TYPE</th>
                                    <th className="py-2.5 px-3">TRIGGER SENSORS</th>
                                    <th className="py-2.5 px-3">SCORE</th>
                                    <th className="py-2.5 px-3">INCIDENT SUMMARY</th>
                                </tr>
                            </thead>
                            <tbody>
                                {threats.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-6 text-center text-[#555]">
                                            No threat events recorded yet. Safe telemetry is actively discarded.
                                        </td>
                                    </tr>
                                ) : (
                                    threats.map((t) => {
                                        const isFire = t.threat_level === "FIRE";
                                        const isCrit = t.threat_level === "CRITICAL";
                                        const isAlert = t.threat_level === "ALERT";
                                        const levelColor = isFire
                                            ? "text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/30"
                                            : isCrit
                                            ? "text-[#e8543f] bg-[#e8543f]/10 border-[#e8543f]/30"
                                            : isAlert
                                            ? "text-[#f97316] bg-[#f97316]/10 border-[#f97316]/30"
                                            : "text-[#eab308] bg-[#eab308]/10 border-[#eab308]/30";

                                        return (
                                            <tr key={t.threat_number} className="border-b border-[#1a1a1a] hover:bg-[#141414] transition">
                                                <td className="py-2 px-3 font-bold text-[#C6FF3D]">
                                                    #{t.threat_number}
                                                </td>
                                                <td className="py-2 px-3 text-[#aaa]">
                                                    {t.date_time ? new Date(t.date_time).toLocaleTimeString() : "--"}
                                                    <span className="block text-[10px] text-[#555]">
                                                        {t.date_time ? new Date(t.date_time).toLocaleDateString() : ""}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${levelColor}`}>
                                                        {t.threat_level}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 font-semibold text-white">
                                                    {t.threat_type}
                                                </td>
                                                <td className="py-2 px-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        {t.trigger_sensors?.map((s, idx) => (
                                                            <span key={idx} className="px-1.5 py-0.5 rounded text-[9px] bg-[#1a1a1a] text-[#bbb] border border-[#2e2e2e]">
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="py-2 px-3 text-[#C6FF3D]">
                                                    {t.threat_score ? (t.threat_score * 100).toFixed(0) + "%" : "--"}
                                                </td>
                                                <td className="py-2 px-3 text-[#888] max-w-xs truncate" title={t.threat_summary}>
                                                    {t.threat_summary || "--"}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </section>
    );
}
