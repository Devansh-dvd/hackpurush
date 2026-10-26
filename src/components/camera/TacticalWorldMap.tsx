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
                    <span className="font-bold">OPENSTREETMAP // SENTRY GIS</span>
                    <span className="text-[#666]">•</span>
                    <span className={isDeviceGps ? "text-[#22c55e] font-bold" : "text-[#C6FF3D]"}>
                        {isDeviceGps ? "LIVE LOCATION ACQUIRED" : sector}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* GPS Detect Trigger */}
                    {onDetectLocation && (
                        <button
                            onClick={onDetectLocation}
                            disabled={gpsLoading}
                            className="px-2.5 py-1 border border-[#C6FF3D] bg-[#C6FF3D]/10 hover:bg-[#C6FF3D] hover:text-black transition text-[11px] font-bold text-[#C6FF3D] flex items-center gap-1.5 cursor-pointer"
                            title="Detect Live Browser / Device GPS Location"
                        >
                            <Navigation size={12} className={gpsLoading ? "animate-spin" : ""} />
                            {gpsLoading ? "ACQUIRING..." : isDeviceGps ? "RE-DETECT GPS" : "USE MY CURRENT LOCATION"}
                        </button>
                    )}

                    {/* OpenStreetMap Dedicated Badge */}
                    <span className="px-2.5 py-1 border border-[#C6FF3D] bg-[#C6FF3D]/15 text-[11px] font-bold text-[#C6FF3D]">
                        OPENSTREETMAP
                    </span>
                </div>
            </div>

            {/* Map Viewport Container */}
            <div className="relative flex-1 min-h-[420px] w-full bg-[#050505] overflow-hidden">
                {/* Leaflet DOM container */}
                <div ref={mapContainerRef} className="w-full h-full min-h-[420px]" style={{ zIndex: 1 }} />

                {/* Floating Map Controls */}
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

                {/* Floating Bottom Left: Real Time Cursor GIS Coordinates */}
                <div className="absolute bottom-3 left-3 bg-black/85 border border-[#262626] px-2.5 py-1 text-[10px] font-mono text-[#aaa] z-[1000] flex items-center gap-2">
                    <Compass size={11} className="text-[#C6FF3D]" />
                    <span>
                        GIS:{" "}
                        {cursorCoords
                            ? `${cursorCoords.lat.toFixed(5)}° N, ${cursorCoords.lon.toFixed(5)}° E`
                            : `${roverLat.toFixed(5)}° N, ${roverLon.toFixed(5)}° E`}
                    </span>
                    <span className="text-[#666]">| NO API KEY REQUIRED (OPENSTREETMAP)</span>
                </div>

                {/* Floating Bottom Right: Map Legend */}
                <div className="absolute bottom-3 right-3 bg-black/85 border border-[#262626] px-2.5 py-1 flex items-center gap-3 font-mono text-[10px] text-[#aaa] z-[1000]">
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
