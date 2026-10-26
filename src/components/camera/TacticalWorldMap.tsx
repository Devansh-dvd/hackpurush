import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, ZoomIn, ZoomOut, Compass, Navigation, Crosshair } from "lucide-react";

interface TacticalWorldMapProps {
    roverLat: number;
    roverLon: number;
    roverHeading: number;
    sector: string;
    onDetectLocation?: () => void;
    gpsLoading?: boolean;
    isDeviceGps?: boolean;
}

export default function TacticalWorldMap({
    roverLat,
    roverLon,
    roverHeading,
    sector,
    onDetectLocation,
    gpsLoading = false,
    isDeviceGps = false,
}: TacticalWorldMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const roverMarkerRef = useRef<L.Marker | null>(null);
    const waypointsLayerRef = useRef<L.LayerGroup | null>(null);

    const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

    const osmConfig = {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        subdomains: "abc",
        maxZoom: 19,
    };

    // Helper to draw waypoints & perimeter around a center coordinate
    const renderOverlays = (map: L.Map, lat: number, lon: number, _heading: number) => {
        if (waypointsLayerRef.current) {
            map.removeLayer(waypointsLayerRef.current);
        }

        const layerGroup = L.layerGroup();

        // 5 Tactical Waypoints surrounding the rover location
        const waypoints: [number, number, string][] = [
            [lat - 0.0009, lon - 0.0011, "WP-01"],
            [lat, lon, "WP-02 (ACTIVE)"],
            [lat + 0.0011, lon + 0.0012, "WP-03"],
            [lat + 0.0005, lon + 0.0026, "WP-04"],
            [lat - 0.0008, lon + 0.0019, "WP-05"],
        ];

        // Polyline connecting waypoints
        const wpLatLngs = waypoints.map(([wLat, wLon]) => [wLat, wLon] as [number, number]);
        L.polyline(wpLatLngs, {
            color: "#2563eb",
            dashArray: "6, 6",
            weight: 3,
            opacity: 0.9,
        }).addTo(layerGroup);

        // Waypoint markers
        waypoints.forEach(([wLat, wLon, label], idx) => {
            const isTarget = idx === 1;
            const wpIcon = L.divIcon({
                className: "wp-leaflet-marker",
                html: `
                    <div style="display: flex; align-items: center; gap: 4px; font-family: monospace; font-size: 10px; font-weight: bold;">
                        <div style="width: 16px; height: 16px; border-radius: 50%; background: ${
                            isTarget ? "#2563eb" : "#222"
                        }; border: 2px solid ${
                    isTarget ? "#fff" : "#666"
                }; box-shadow: ${isTarget ? "0 0 10px #2563eb" : "none"}; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 9px;">
                            ${idx + 1}
                        </div>
                        <span style="background: rgba(0,0,0,0.85); color: ${
                            isTarget ? "#60a5fa" : "#e5e7eb"
                        }; padding: 1px 5px; border-radius: 2px; border: 1px solid #444;">${label}</span>
                    </div>
                `,
                iconSize: [110, 22],
                iconAnchor: [8, 11],
            });

            L.marker([wLat, wLon], { icon: wpIcon }).addTo(layerGroup);
        });

        // Restricted Perimeter Boundary Box
        const perimeterCoords: [number, number][] = [
            [lat - 0.0018, lon - 0.0022],
            [lat + 0.0022, lon - 0.0022],
            [lat + 0.0022, lon + 0.0038],
            [lat - 0.0018, lon + 0.0038],
        ];

        L.polygon(perimeterCoords, {
            color: "#dc2626",
            dashArray: "6, 5",
            fillColor: "#dc2626",
            fillOpacity: 0.06,
            weight: 2,
        }).addTo(layerGroup);

        layerGroup.addTo(map);
        waypointsLayerRef.current = layerGroup;
    };

    // Initialize Map with OpenStreetMap
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, {
            center: [roverLat, roverLon],
            zoom: 17,
            zoomControl: false,
            attributionControl: false,
        });

        // Add OpenStreetMap tile layer directly
        L.tileLayer(osmConfig.url, {
            attribution: osmConfig.attribution,
            subdomains: osmConfig.subdomains,
            maxZoom: osmConfig.maxZoom,
        }).addTo(map);

        mapInstanceRef.current = map;

        // Custom Rover DivIcon
        const roverIcon = L.divIcon({
            className: "rover-leaflet-marker",
            html: `
                <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
                    <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(198,255,61,0.3); border: 2px dashed #C6FF3D; animation: spin 8s linear infinite;"></div>
                    <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: #C6FF3D; border: 2.5px solid #000; box-shadow: 0 0 14px #C6FF3D; display: flex; align-items: center; justify-content: center;">
                        <div style="width: 7px; height: 7px; border-radius: 50%; background: #000;"></div>
                    </div>
                    <div style="position: absolute; top: -7px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid #C6FF3D; transform: rotate(${roverHeading}deg); transform-origin: 50% 29px;"></div>
                </div>
            `,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
        });

        const roverMarker = L.marker([roverLat, roverLon], { icon: roverIcon }).addTo(map);
        roverMarker.bindPopup(`
            <div style="font-family: monospace; font-size: 11px; padding: 4px; color: #111;">
                <b style="color: #000; font-size: 12px;">ABSR-ROVER-01</b><br/>
                <b>LAT:</b> ${roverLat.toFixed(5)}° N<br/>
                <b>LON:</b> ${roverLon.toFixed(5)}° E<br/>
                <b>HEADING:</b> ${roverHeading}° N-NE
            </div>
        `);
        roverMarkerRef.current = roverMarker;

        renderOverlays(map, roverLat, roverLon, roverHeading);

        map.on("mousemove", (e) => {
            setCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
        });

        setTimeout(() => {
            map.invalidateSize();
        }, 200);

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

    // Reactive update when roverLat / roverLon changes (e.g. from device GPS)
    useEffect(() => {
        if (!mapInstanceRef.current || !roverMarkerRef.current) return;

        roverMarkerRef.current.setLatLng([roverLat, roverLon]);
        roverMarkerRef.current.setPopupContent(`
            <div style="font-family: monospace; font-size: 11px; padding: 4px; color: #111;">
                <b style="color: #000; font-size: 12px;">ABSR-ROVER-01 (LIVE GPS)</b><br/>
                <b>LAT:</b> ${roverLat.toFixed(5)}° N<br/>
                <b>LON:</b> ${roverLon.toFixed(5)}° E<br/>
                <b>HEADING:</b> ${roverHeading}°
            </div>
        `);

        mapInstanceRef.current.setView([roverLat, roverLon], 17, { animate: true });
        renderOverlays(mapInstanceRef.current, roverLat, roverLon, roverHeading);
    }, [roverLat, roverLon, roverHeading]);

    const [mapMode, setMapMode] = useState<"OSM" | "OFFLINE_GRID">("OSM");

    const zoomIn = () => mapInstanceRef.current?.zoomIn();
    const zoomOut = () => mapInstanceRef.current?.zoomOut();
    const recenterRover = () => {
        mapInstanceRef.current?.setView([roverLat, roverLon], 17, { animate: true });
    };

    return (
        <div className="flex flex-col border border-[#2a2a2a] bg-[#090909] h-full">
            {/* Map Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] bg-[#0d0d0d] font-mono text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2 text-white">
                    <MapPin size={14} className="text-[#C6FF3D]" />
                    <span className="font-bold">
                        {mapMode === "OSM" ? "OPENSTREETMAP // SENTRY GIS" : "OFFLINE TACTICAL VECTOR GRID"}
                    </span>
                    <span className="text-[#666]">•</span>
                    <span className={isDeviceGps ? "text-[#22c55e] font-bold" : "text-[#C6FF3D]"}>
                        {isDeviceGps ? "LIVE LOCATION ACQUIRED" : sector}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Layer Mode Toggle: Online OSM vs 100% Offline Vector Grid */}
                    <div className="flex border border-[#333] bg-[#111]">
                        <button
                            onClick={() => setMapMode("OSM")}
                            className={`px-2.5 py-1 text-[10px] font-bold transition cursor-pointer ${
                                mapMode === "OSM"
                                    ? "bg-[#C6FF3D] text-black"
                                    : "text-[#888] hover:text-white"
                            }`}
                        >
                            ONLINE OSM
                        </button>
                        <button
                            onClick={() => setMapMode("OFFLINE_GRID")}
                            className={`px-2.5 py-1 text-[10px] font-bold transition cursor-pointer ${
                                mapMode === "OFFLINE_GRID"
                                    ? "bg-[#C6FF3D] text-black"
                                    : "text-[#888] hover:text-white"
                            }`}
                        >
                            OFFLINE GRID
                        </button>
                    </div>

                    {/* GPS Detect Trigger */}
                    {onDetectLocation && (
                        <button
                            onClick={onDetectLocation}
                            disabled={gpsLoading}
                            className="px-2.5 py-1 border border-[#333] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition text-[10px] font-bold text-[#888] flex items-center gap-1.5 cursor-pointer"
                            title="Detect Live Browser / Device GPS Location"
                        >
                            <Navigation size={11} className={gpsLoading ? "animate-spin" : ""} />
                            {gpsLoading ? "ACQUIRING..." : isDeviceGps ? "RE-DETECT GPS" : "MY GPS"}
                        </button>
                    )}
                </div>
            </div>

            {/* Map Viewport Container */}
            <div className="relative flex-1 min-h-[420px] w-full bg-[#050505] overflow-hidden">
                {/* 1. Leaflet OpenStreetMap Container */}
                <div 
                    ref={mapContainerRef} 
                    className={`w-full h-full min-h-[420px] ${mapMode === "OFFLINE_GRID" ? "hidden" : "block"}`} 
                    style={{ zIndex: 1 }} 
                />

                {/* 2. 100% Offline Tactical Vector Radar Grid (Zero Internet Needed) */}
                {mapMode === "OFFLINE_GRID" && (
                    <div 
                        className="relative w-full h-full min-h-[420px] flex items-center justify-center bg-[#07090b] overflow-hidden select-none"
                        style={{
                            backgroundImage: "linear-gradient(to right, #111a1f 1px, transparent 1px), linear-gradient(to bottom, #111a1f 1px, transparent 1px)",
                            backgroundSize: "40px 40px",
                        }}
                    >
                        {/* Vector SVG Range Rings & Compass */}
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 500">
                            {/* Outer Range Rings */}
                            <circle cx="400" cy="250" r="220" fill="none" stroke="#1f2d36" strokeWidth="1" strokeDasharray="4 4" />
                            <circle cx="400" cy="250" r="160" fill="none" stroke="#223945" strokeWidth="1" />
                            <circle cx="400" cy="250" r="100" fill="none" stroke="#2b4756" strokeWidth="1" strokeDasharray="2 2" />
                            <circle cx="400" cy="250" r="40" fill="none" stroke="#375d71" strokeWidth="1" />

                            {/* Range Distance Labels */}
                            <text x="405" y="245" fill="#4b7086" fontSize="9" fontFamily="monospace">40m</text>
                            <text x="405" y="185" fill="#4b7086" fontSize="9" fontFamily="monospace">100m</text>
                            <text x="405" y="125" fill="#4b7086" fontSize="9" fontFamily="monospace">250m</text>
                            <text x="405" y="65" fill="#4b7086" fontSize="9" fontFamily="monospace">500m</text>

                            {/* Cardinal Crosshairs */}
                            <line x1="400" y1="20" x2="400" y2="480" stroke="#1c2a32" strokeWidth="1" />
                            <line x1="120" y1="250" x2="680" y2="250" stroke="#1c2a32" strokeWidth="1" />

                            {/* Cardinal Headings */}
                            <text x="400" y="32" textAnchor="middle" fill="#C6FF3D" fontSize="12" fontWeight="bold" fontFamily="monospace">000° NORTH</text>
                            <text x="660" y="254" fill="#64889c" fontSize="10" fontFamily="monospace">090° E</text>
                            <text x="400" y="475" textAnchor="middle" fill="#64889c" fontSize="10" fontFamily="monospace">180° S</text>
                            <text x="140" y="254" fill="#64889c" fontSize="10" fontFamily="monospace">270° W</text>

                            {/* Perimeter Polygon Boundary */}
                            <polygon 
                                points="290,130 520,110 570,360 250,380" 
                                fill="rgba(220,38,38,0.06)" 
                                stroke="#dc2626" 
                                strokeWidth="1.5" 
                                strokeDasharray="5 5" 
                            />

                            {/* Waypoint Path Lines */}
                            <polyline 
                                points="320,320 400,250 490,170 540,220 510,340" 
                                fill="none" 
                                stroke="#2563eb" 
                                strokeWidth="2" 
                                strokeDasharray="6 4" 
                            />

                            {/* Waypoints */}
                            {[
                                { x: 320, y: 320, label: "WP-01" },
                                { x: 400, y: 250, label: "WP-02 [ACTIVE]" },
                                { x: 490, y: 170, label: "WP-03" },
                                { x: 540, y: 220, label: "WP-04" },
                                { x: 510, y: 340, label: "WP-05" },
                            ].map((wp, i) => (
                                <g key={i}>
                                    <circle cx={wp.x} cy={wp.y} r="5" fill="#2563eb" stroke="#fff" strokeWidth="1" />
                                    <text x={wp.x + 8} y={wp.y + 4} fill="#88b4d8" fontSize="10" fontFamily="monospace" fontWeight="bold">
                                        {wp.label}
                                    </text>
                                </g>
                            ))}

                            {/* Rover Heading Directional Cone */}
                            <g transform={`translate(400, 250) rotate(${roverHeading})`}>
                                <path d="M 0 0 L -25 -70 L 25 -70 Z" fill="rgba(198,255,61,0.18)" />
                                <line x1="0" y1="0" x2="0" y2="-80" stroke="#C6FF3D" strokeWidth="1.5" strokeDasharray="3 3" />
                                <circle cx="0" cy="0" r="7" fill="#C6FF3D" stroke="#000" strokeWidth="2" />
                            </g>
                        </svg>

                        {/* Center Rover Overlay Badge */}
                        <div className="absolute z-10 bottom-12 px-3 py-1.5 bg-black/85 border border-[#C6FF3D] font-mono text-[11px] text-white flex items-center gap-2 backdrop-blur">
                            <span className="w-2 h-2 rounded-full bg-[#C6FF3D] animate-ping" />
                            <span>OFFLINE GIS LOCK:</span>
                            <span className="text-[#C6FF3D] font-bold">{roverLat.toFixed(5)}°N, {roverLon.toFixed(5)}°E</span>
                            <span className="text-[#888]">HDG: {roverHeading}°</span>
                        </div>
                    </div>
                )}

                {/* Floating Map Controls (OSM mode) */}
                {mapMode === "OSM" && (
                    <div className="absolute top-3 right-3 flex flex-col gap-1.5 font-mono z-[1000]">
                        <button
                            onClick={zoomIn}
                            className="w-8 h-8 bg-black/85 border border-[#333] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition flex items-center justify-center text-white text-xs cursor-pointer shadow-md"
                            title="Zoom In"
                        >
                            <ZoomIn size={14} />
                        </button>
                        <button
                            onClick={zoomOut}
                            className="w-8 h-8 bg-black/85 border border-[#333] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition flex items-center justify-center text-white text-xs cursor-pointer shadow-md"
                            title="Zoom Out"
                        >
                            <ZoomOut size={14} />
                        </button>
                        <button
                            onClick={recenterRover}
                            className="w-8 h-8 bg-black/85 border border-[#333] hover:border-[#C6FF3D] hover:text-[#C6FF3D] transition flex items-center justify-center text-white text-xs cursor-pointer shadow-md"
                            title="Recenter on Rover"
                        >
                            <Crosshair size={14} />
                        </button>
                    </div>
                )}

                {/* Floating Bottom Left: Real Time Cursor GIS Coordinates */}
                <div className="absolute bottom-3 left-3 bg-black/85 border border-[#262626] px-2.5 py-1 text-[10px] font-mono text-[#aaa] z-[1000] flex items-center gap-2 backdrop-blur">
                    <Compass size={11} className="text-[#C6FF3D]" />
                    <span>
                        GIS:{" "}
                        {cursorCoords
                            ? `${cursorCoords.lat.toFixed(5)}° N, ${cursorCoords.lon.toFixed(5)}° E`
                            : `${roverLat.toFixed(5)}° N, ${roverLon.toFixed(5)}° E`}
                    </span>
                    <span className="text-[#666]">| {mapMode === "OSM" ? "ONLINE OSM" : "OFFLINE VECTOR RADAR"}</span>
                </div>

                {/* Floating Bottom Right: Map Legend */}
                <div className="absolute bottom-3 right-3 bg-black/85 border border-[#262626] px-2.5 py-1 flex items-center gap-3 font-mono text-[10px] text-[#aaa] z-[1000] backdrop-blur">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#C6FF3D]" /> ROVER POS
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#2563eb]" /> ACTIVE WP
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-0.5 bg-[#dc2626]" /> PERIMETER
                    </span>
                </div>
            </div>
        </div>
    );
}
