import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    Database,
    ShieldAlert,
    AlertTriangle,
    Flame,
    RefreshCw,
    Search,
    Download,
    Wifi,
    WifiOff,
    CheckCircle2,
    Eye,
    Clock,
    Filter
} from "lucide-react";
import { useNetworkStatus } from "./hooks/useNetworkStatus";

export interface ThreatLogRecord {
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
    gps_satellites?: number;
    ambient_temp_c?: number;
    humidity_pct?: number;
    lora_rssi_dbm?: number;
    patrol_mode?: string;
    gps_lat?: number;
    gps_lon?: number;
    threat_summary?: string;
}

export default function PastThreatEventsPage() {
    const { isOnline, toggleStatus } = useNetworkStatus();
    const [threats, setThreats] = useState<ThreatLogRecord[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedSensor, setSelectedSensor] = useState<string>("ALL");
    const [dbOnline, setDbOnline] = useState<boolean>(true);
    const [usingCache, setUsingCache] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<Date>(new Date());

    // Clock
    useEffect(() => {
        const id = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Load threat events from local PostgreSQL (or fallback to localStorage cache)
    const loadThreats = useCallback(async (manual = false) => {
        if (manual) setIsRefreshing(true);
        try {
            const res = await fetch("/threat-api/api/threats?limit=100");
            if (res.ok) {
                const data: ThreatLogRecord[] = await res.json();
                setThreats(data);
                setDbOnline(true);
                setUsingCache(false);
                // Cache for offline resilience
                try {
                    localStorage.setItem("ironclad_cached_threats", JSON.stringify(data));
                } catch {
                    // Ignore storage quota
                }
            } else {
                throw new Error(`HTTP ${res.status}`);
            }
        } catch {
            // Offline fallback to local storage cache
            const cached = localStorage.getItem("ironclad_cached_threats");
            if (cached) {
                try {
                    setThreats(JSON.parse(cached));
                    setUsingCache(true);
                } catch {
                    setThreats([]);
                }
            } else {
                setThreats([]);
            }
            setDbOnline(false);
        } finally {
            setLoading(false);
            if (manual) setIsRefreshing(false);
        }
    }, []);

    // Initial load and periodic refresh
    useEffect(() => {
        loadThreats();
        const poll = setInterval(() => loadThreats(false), 5000);
        return () => clearInterval(poll);
    }, [loadThreats]);

    // Export threats to CSV
    const exportCSV = () => {
        if (threats.length === 0) return;
        const headers = ["Threat #", "Date & Time", "Level", "Type", "Score", "Triggers", "Obstacle (cm)", "Sound (ADC)", "Metal", "Flame (ADC)", "Temp (C)", "Humidity (%)", "LoRa RSSI", "Summary"];
        const rows = threats.map(t => [
            t.threat_number,
            t.date_time,
            t.threat_level,
            `"${t.threat_type}"`,
            t.threat_score,
            `"${t.trigger_sensors?.join('; ') || ''}"`,
            t.obstacle_dist_cm ?? "",
            t.acoustic_snd_adc ?? "",
            t.metal_detected ?? false,
            t.flame_ir_adc ?? "",
            t.ambient_temp_c ?? "",
            t.humidity_pct ?? "",
            t.lora_rssi_dbm ?? "",
            `"${(t.threat_summary || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ironclad_threat_events_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filter threats
    const filteredThreats = useMemo(() => {
        return threats.filter(t => {
            // Level filter
            if (selectedLevel !== "ALL" && t.threat_level !== selectedLevel) return false;
            // Sensor filter
            if (selectedSensor !== "ALL" && !t.trigger_sensors?.includes(selectedSensor)) return false;
            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchType = t.threat_type?.toLowerCase().includes(q);
                const matchSummary = t.threat_summary?.toLowerCase().includes(q);
                const matchId = String(t.threat_number).includes(q);
                const matchSensors = t.trigger_sensors?.some(s => s.toLowerCase().includes(q));
                if (!matchType && !matchSummary && !matchId && !matchSensors) return false;
            }
            return true;
        });
    }, [threats, selectedLevel, selectedSensor, searchQuery]);

    // Statistics counts
    const stats = useMemo(() => {
        const total = threats.length;
        const fire = threats.filter(t => t.threat_level === "FIRE").length;
        const critical = threats.filter(t => t.threat_level === "CRITICAL").length;
        const alert = threats.filter(t => t.threat_level === "ALERT").length;
        const watch = threats.filter(t => t.threat_level === "WATCH").length;
        return { total, fire, critical, alert, watch };
    }, [threats]);

    const pad = (n: number) => n.toString().padStart(2, "0");

    return (
        <div style={{ background: "#050505", color: "#e8e8e8", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif" }} className="flex flex-col">
            {/* Background grid */}
            <div
                className="pointer-events-none fixed inset-0 opacity-[0.25]"
                style={{
                    backgroundImage: "linear-gradient(to right, #161616 1px, transparent 1px), linear-gradient(to bottom, #161616 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                }}
            />

            {/* TOP NAVIGATION BAR */}
            <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-4 border-b border-[#262626] bg-[#0a0a0a]">
                <div className="flex items-center gap-4 flex-wrap">
                    <Link
                        to="/"
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono font-bold text-white border border-[#333] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition cursor-pointer"
                    >
                        <ArrowLeft size={14} />
                        BACK TO DASHBOARD
                    </Link>

                    <div className="flex items-center gap-2">
                        <span style={{ background: "#C6FF3D" }} className="w-2.5 h-2.5 inline-block" />
                        <span className="tracking-tight font-bold text-xl text-white">IRONCLAD</span>
                        <span className="text-xs px-2 py-0.5 font-mono bg-[#141414] border border-[#333] text-[#C6FF3D]">
                            PAST THREAT EVENTS
                        </span>
                        <span className="hidden lg:inline text-[11px] font-mono text-[#777]">
                            [POSTGRESQL ARCHIVE // DATABASE: hackpurush]
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3 font-mono text-xs">
                    {/* Database connection badge */}
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111] border border-[#2a2a2a]">
                        <Database className="w-3.5 h-3.5 text-[#C6FF3D]" />
                        <span className={`w-1.5 h-1.5 rounded-full ${dbOnline ? "bg-[#22c55e] animate-pulse" : usingCache ? "bg-[#eab308]" : "bg-[#ef4444]"}`} />
                        <span className="text-[#bbb]">
                            {dbOnline ? "POSTGRESQL 18: ONLINE" : usingCache ? "OFFLINE CACHE ACTIVE" : "DB OFFLINE"}
                        </span>
                    </div>

                    {/* Online / Offline mode toggle */}
                    <button
                        onClick={() => toggleStatus(!isOnline)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 border transition cursor-pointer ${
                            isOnline
                                ? "border-[#22c55e]/50 bg-[#22c55e]/10 text-[#22c55e] hover:border-[#22c55e]"
                                : "border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#f59e0b] hover:border-[#f59e0b]"
                        }`}
                        title="Click to toggle Online/Offline Mode"
                    >
                        {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
                        <span>{isOnline ? "ONLINE" : "OFFLINE"}</span>
                    </button>

                    <span className="hidden sm:inline text-xs text-[#888]">
                        {pad(currentTime.getHours())}:{pad(currentTime.getMinutes())}:{pad(currentTime.getSeconds())}
                    </span>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="relative z-10 flex-1 px-6 md:px-10 py-8 max-w-[1700px] w-full mx-auto flex flex-col gap-6">

                {/* OFFLINE STATUS BANNER (When Offline) */}
                {!isOnline && (
                    <div className="px-4 py-3 rounded border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b] font-mono text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <WifiOff className="w-4 h-4 text-[#f59e0b]" />
                            <span><strong>OFFLINE MODE ACTIVE:</strong> Past threat events are served directly from your local PostgreSQL database (or local storage cache). No internet connection is required.</span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-[#f59e0b]/20 border border-[#f59e0b]/30">100% LOCAL OPERATION</span>
                    </div>
                )}

                {/* SUMMARY STATS TILES */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded flex flex-col justify-between">
                        <span className="text-xs font-mono text-[#888]">TOTAL RECORDED THREATS</span>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-3xl font-bold text-[#C6FF3D] font-mono">{stats.total}</span>
                            <Database className="w-4 h-4 text-[#555]" />
                        </div>
                    </div>
                    <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded flex flex-col justify-between">
                        <span className="text-xs font-mono text-[#888]">FIRE HAZARDS</span>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-3xl font-bold text-[#ef4444] font-mono">{stats.fire}</span>
                            <Flame className="w-4 h-4 text-[#ef4444]" />
                        </div>
                    </div>
                    <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded flex flex-col justify-between">
                        <span className="text-xs font-mono text-[#888]">CRITICAL INCURSIONS</span>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-3xl font-bold text-[#e8543f] font-mono">{stats.critical}</span>
                            <AlertTriangle className="w-4 h-4 text-[#e8543f]" />
                        </div>
                    </div>
                    <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded flex flex-col justify-between">
                        <span className="text-xs font-mono text-[#888]">ACTIVE ALERTS</span>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-3xl font-bold text-[#f97316] font-mono">{stats.alert}</span>
                            <ShieldAlert className="w-4 h-4 text-[#f97316]" />
                        </div>
                    </div>
                    <div className="p-4 bg-[#0a0a0a] border border-[#222] rounded flex flex-col justify-between col-span-2 sm:col-span-1">
                        <span className="text-xs font-mono text-[#888]">WATCH / ADVISORY</span>
                        <div className="flex items-baseline justify-between mt-2">
                            <span className="text-3xl font-bold text-[#eab308] font-mono">{stats.watch}</span>
                            <Eye className="w-4 h-4 text-[#eab308]" />
                        </div>
                    </div>
                </div>

                {/* FILTER & SIMULATION TOOLBAR */}
                <div className="p-4 bg-[#0d0d0d] border border-[#262626] rounded flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                    {/* Left: Filters & Search */}
                    <div className="flex items-center gap-3 flex-wrap flex-1">
                        {/* Search input */}
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="w-3.5 h-3.5 text-[#666] absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search by threat type, sensor, #..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#141414] border border-[#333] rounded pl-9 pr-3 py-1.5 text-xs font-mono text-white placeholder-[#555] focus:outline-none focus:border-[#C6FF3D]"
                            />
                        </div>

                        {/* Level selector buttons */}
                        <div className="flex items-center gap-1 text-xs font-mono">
                            {["ALL", "FIRE", "CRITICAL", "ALERT", "WATCH"].map(lvl => (
                                <button
                                    key={lvl}
                                    onClick={() => setSelectedLevel(lvl)}
                                    className={`px-2.5 py-1 rounded border transition ${
                                        selectedLevel === lvl
                                            ? "bg-[#C6FF3D] text-black font-bold border-[#C6FF3D]"
                                            : "bg-[#141414] text-[#888] border-[#333] hover:text-white"
                                    }`}
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>

                        {/* Sensor Trigger dropdown */}
                        <div className="flex items-center gap-1.5">
                            <Filter className="w-3.5 h-3.5 text-[#666]" />
                            <select
                                value={selectedSensor}
                                onChange={(e) => setSelectedSensor(e.target.value)}
                                className="bg-[#141414] border border-[#333] rounded px-2 py-1 text-xs font-mono text-[#ccc] focus:outline-none focus:border-[#C6FF3D]"
                            >
                                <option value="ALL">ALL SENSORS</option>
                                <option value="FLAME_IR">FLAME IR</option>
                                <option value="OBSTACLE_DIST">OBSTACLE DIST</option>
                                <option value="METAL_SENSOR">METAL SENSOR</option>
                                <option value="ACOUSTIC_SND">ACOUSTIC SND</option>
                                <option value="AMBIENT_TEMP">AMBIENT TEMP</option>
                                <option value="HUMIDITY">HUMIDITY</option>
                                <option value="LORA_RSSI">LORA RSSI</option>
                            </select>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Export & Refresh */}
                        <button
                            onClick={exportCSV}
                            disabled={threats.length === 0}
                            className="px-2.5 py-1 text-xs font-mono rounded bg-[#141414] border border-[#333] text-[#ccc] hover:text-[#C6FF3D] hover:border-[#C6FF3D] transition flex items-center gap-1"
                            title="Export all threats to CSV"
                        >
                            <Download className="w-3.5 h-3.5" /> Export CSV
                        </button>
                        <button
                            onClick={() => loadThreats(true)}
                            disabled={isRefreshing}
                            className="px-2.5 py-1 text-xs font-mono rounded bg-[#141414] border border-[#333] text-[#ccc] hover:text-white transition flex items-center gap-1"
                            title="Refresh from PostgreSQL"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
                        </button>
                    </div>
                </div>

                {/* THREAT EVENTS DISPLAY */}
                {loading ? (
                    <div className="py-20 text-center text-sm font-mono text-[#777] flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#C6FF3D]" />
                        <span>FETCHING THREAT AUDIT LOGS FROM POSTGRESQL (hackpurush)...</span>
                    </div>
                ) : filteredThreats.length === 0 ? (
                    /* ─── EMPTY STATE: NO PAST THREAT EVENTS (EXACT REQUIREMENT) ───────── */
                    <div className="py-24 px-6 text-center border border-[#262626] rounded-lg bg-[#0a0a0a] flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-[#161616] border border-[#333] flex items-center justify-center mb-4 text-[#22c55e]">
                            <CheckCircle2 className="w-8 h-8 text-[#22c55e]" />
                        </div>
                        <h3 className="text-xl font-bold tracking-wider text-white mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            NO PAST THREAT EVENTS RECORDED
                        </h3>
                        <p className="text-xs font-mono text-[#888] max-w-md mx-auto leading-relaxed mb-6">
                            The PostgreSQL database <code className="text-[#C6FF3D]">hackpurush</code> currently contains 0 threat events.
                            All sensor telemetry has remained strictly within safe operational limits.
                            Safe telemetry is actively filtered and discarded without database insertion.
                        </p>
                        <div className="flex items-center gap-3 flex-wrap justify-center">
                            <button
                                onClick={() => loadThreats(true)}
                                className="px-3.5 py-2 text-xs font-mono rounded bg-[#141414] border border-[#333] text-[#ccc] hover:text-white transition flex items-center gap-1.5"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Re-check Database
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ─── POPULATED STATE: THREAT EVENTS LIST ───────────────────────────── */
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between text-xs font-mono text-[#888] px-1">
                            <span>SHOWING {filteredThreats.length} OF {threats.length} RECORDED THREATS</span>
                            <span>SORTED BY: THREAT NUMBER (LATEST FIRST)</span>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            {filteredThreats.map((t) => {
                                const isFire = t.threat_level === "FIRE";
                                const isCrit = t.threat_level === "CRITICAL";
                                const isAlert = t.threat_level === "ALERT";

                                const borderCol = isFire
                                    ? "border-[#ef4444]/40 hover:border-[#ef4444]"
                                    : isCrit
                                    ? "border-[#e8543f]/40 hover:border-[#e8543f]"
                                    : isAlert
                                    ? "border-[#f97316]/40 hover:border-[#f97316]"
                                    : "border-[#eab308]/40 hover:border-[#eab308]";

                                const badgeCol = isFire
                                    ? "bg-[#ef4444]/15 border-[#ef4444]/50 text-[#ef4444]"
                                    : isCrit
                                    ? "bg-[#e8543f]/15 border-[#e8543f]/50 text-[#e8543f]"
                                    : isAlert
                                    ? "bg-[#f97316]/15 border-[#f97316]/50 text-[#f97316]"
                                    : "bg-[#eab308]/15 border-[#eab308]/50 text-[#eab308]";

                                const d = t.date_time ? new Date(t.date_time) : null;

                                return (
                                    <div
                                        key={t.threat_number}
                                        className={`p-5 bg-[#0a0a0a] border ${borderCol} rounded-lg transition flex flex-col gap-4`}
                                    >
                                        {/* Top Header of Card */}
                                        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[#1f1f1f] pb-3">
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-bold text-lg text-[#C6FF3D]">
                                                    THREAT #{t.threat_number}
                                                </span>
                                                <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${badgeCol} flex items-center gap-1`}>
                                                    {isFire && <Flame className="w-3.5 h-3.5" />}
                                                    {isCrit && <AlertTriangle className="w-3.5 h-3.5" />}
                                                    {t.threat_level}
                                                </span>
                                                <span className="text-sm font-bold text-white font-mono">
                                                    {t.threat_type}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs font-mono text-[#888]">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-[#555]" />
                                                    <span className="text-[#ccc]">{d ? d.toLocaleTimeString() : "--"}</span>
                                                    <span className="text-[#666]">{d ? d.toLocaleDateString() : ""}</span>
                                                </div>
                                                <span className="px-2 py-0.5 rounded bg-[#161616] border border-[#2a2a2a] text-[#C6FF3D]">
                                                    SCORE: {t.threat_score ? (t.threat_score * 100).toFixed(0) + "%" : "--"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Sensor snapshot values */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs font-mono">
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">OBSTACLE DIST</span>
                                                <span className={`font-bold ${t.obstacle_dist_cm !== undefined && t.obstacle_dist_cm < 40 ? "text-[#ef4444]" : "text-white"}`}>
                                                    {t.obstacle_dist_cm !== undefined && t.obstacle_dist_cm !== null ? `${t.obstacle_dist_cm} cm` : "--"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">ACOUSTIC SND</span>
                                                <span className={`font-bold ${t.acoustic_snd_adc !== undefined && t.acoustic_snd_adc > 2500 ? "text-[#ef4444]" : "text-white"}`}>
                                                    {t.acoustic_snd_adc !== undefined && t.acoustic_snd_adc !== null ? `${t.acoustic_snd_adc} ADC` : "--"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">METAL SENSOR</span>
                                                <span className={`font-bold ${t.metal_detected ? "text-[#f97316]" : "text-[#22c55e]"}`}>
                                                    {t.metal_detected ? "DETECTED" : "CLEAR"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">FLAME IR</span>
                                                <span className={`font-bold ${t.flame_ir_adc !== undefined && t.flame_ir_adc < 1500 ? "text-[#ef4444]" : "text-white"}`}>
                                                    {t.flame_ir_adc !== undefined && t.flame_ir_adc !== null ? `${t.flame_ir_adc} ADC` : "--"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">AMBIENT TEMP</span>
                                                <span className={`font-bold ${t.ambient_temp_c !== undefined && t.ambient_temp_c > 55 ? "text-[#ef4444]" : "text-white"}`}>
                                                    {t.ambient_temp_c !== undefined && t.ambient_temp_c !== null ? `${t.ambient_temp_c} °C` : "--"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">HUMIDITY</span>
                                                <span className="font-bold text-white">
                                                    {t.humidity_pct !== undefined && t.humidity_pct !== null ? `${t.humidity_pct} %` : "--"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">LORA RSSI</span>
                                                <span className={`font-bold ${t.lora_rssi_dbm !== undefined && t.lora_rssi_dbm < -125 ? "text-[#ef4444]" : "text-white"}`}>
                                                    {t.lora_rssi_dbm !== undefined && t.lora_rssi_dbm !== null ? `${t.lora_rssi_dbm} dBm` : "--"}
                                                </span>
                                            </div>
                                            <div className="p-2 rounded bg-[#111] border border-[#222]">
                                                <span className="text-[10px] text-[#777] block">PATROL MODE</span>
                                                <span className="font-bold text-[#C6FF3D]">
                                                    {t.patrol_mode || "STANDBY"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Trigger sensors & Summary */}
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-[#1a1a1a] text-xs font-mono">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[#666]">TRIGGERS:</span>
                                                {t.trigger_sensors?.map((s, idx) => (
                                                    <span key={idx} className="px-2 py-0.5 rounded text-[10px] bg-[#161616] border border-[#333] text-[#C6FF3D]">
                                                        {s}
                                                    </span>
                                                ))}
                                            </div>

                                            <div className="text-[#888] text-[11px] max-w-xl truncate" title={t.threat_summary}>
                                                {t.threat_summary || "--"}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
