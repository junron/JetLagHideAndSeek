import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import * as L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { LocateIcon, Edit3 } from "lucide-react";

import { Button } from "@/components/ui/button";
// import { cn } from "@/lib/utils"; // Not used here
import { defaultUnit, leafletMapContext } from "@/lib/context";

export const MeasureTool = () => {
    const map = useStore(leafletMapContext);
    const $defaultUnit = useStore(defaultUnit);

    const [enabled, setEnabled] = useState(false);
    // single-shot location selection — toggles removed
    const [, setTick] = useState(0);
    const [loadingA, setLoadingA] = useState(false);
    const [loadingB, setLoadingB] = useState(false);

    const pointsRef = useRef<(L.LatLng | null)[]>([null, null]);
    const markersRef = useRef<(L.Marker | null)[]>([null, null]);
    const lineRef = useRef<L.Polyline | null>(null);
    // no watch ids — single-shot only

    const clearAll = () => {
        if (!map) return;
        markersRef.current.forEach((m) => {
            if (m) try { map.removeLayer(m); } catch (e) {}
        });
        markersRef.current = [null, null];
        if (lineRef.current) {
            try { map.removeLayer(lineRef.current); } catch (e) {}
            lineRef.current = null;
        }
        pointsRef.current = [null, null];
        // Force rerender so UI updates to show cleared coordinates
        setTick((t) => t + 1);
        setLoadingA(false);
        setLoadingB(false);
    };
    const suppressMapClickRef = useRef(false);

    const recomputeLineAndMarkers = () => {
        if (!map) return;
        const [p0, p1] = pointsRef.current;
        // Remove existing line
        if (lineRef.current) {
            try { map.removeLayer(lineRef.current); } catch (e) {}
            lineRef.current = null;
        }
        const markers = markersRef.current;
        if (p0 && !markers[0]) {
            markers[0] = L.marker(p0).addTo(map);
        } else if (!p0 && markers[0]) {
            try { map.removeLayer(markers[0]!); } catch (e) {}
            markers[0] = null;
        }
        if (p1 && !markers[1]) {
            markers[1] = L.marker(p1).addTo(map);
        } else if (!p1 && markers[1]) {
            try { map.removeLayer(markers[1]!); } catch (e) {}
            markers[1] = null;
        }

        if (p0 && p1) {
            lineRef.current = L.polyline([p0, p1], { color: "#1976D2", weight: 3 }).addTo(map);
        }
    };

    const computeDistanceText = () => {
        const [p0, p1] = pointsRef.current;
        if (!p0 || !p1) return "";
        const dKm = turf.distance(
            turf.point([p0.lng, p0.lat]),
            turf.point([p1.lng, p1.lat]),
            { units: "kilometers" },
        );
        const meters = dKm * 1000;
        if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
        return `${meters.toFixed(0)} m`;
    };

    const formatCoords = (latlng?: L.LatLng | null) => {
        if (!latlng) return "Not set";
        return `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    };

    const setPointToCurrent = async (idx: 0 | 1) => {
        if (!map) return;
        if (!navigator || !navigator.geolocation) {
            toast.error("Geolocation is not available in your browser");
            return;
        }
        if (idx === 0) setLoadingA(true);
        if (idx === 1) setLoadingB(true);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                pointsRef.current[idx] = L.latLng(lat, lng);
                recomputeLineAndMarkers();
                setTick((t) => t + 1);
                // ensure the map centers to the location
                try { map.flyTo([lat, lng], Math.max(map.getZoom(), 14)); } catch (err) {}
                if (idx === 0) setLoadingA(false);
                if (idx === 1) setLoadingB(false);
            },
            (err) => {
                toast.error("Unable to access your current location");
                if (idx === 0) setLoadingA(false);
                if (idx === 1) setLoadingB(false);
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
        );
    };

    const handleEditPoint = (idx: 0 | 1) => {
        if (!map) return;
        suppressMapClickRef.current = true;
        const input = prompt("Enter coordinates (lat,lng)");
        if (!input) return;
        const parts = input.split(",");
        if (parts.length < 2) {
            toast.error("Invalid input");
            return;
        }
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lng)) {
            toast.error("Invalid coordinates");
            return;
        }
        pointsRef.current[idx] = L.latLng(lat, lng);
        recomputeLineAndMarkers();
        setTick((t) => t + 1);
    };

    useEffect(() => {
        if (!map) return;
        if (!enabled) {
            // cleanup
            clearAll();
            return;
        }

        const onClick = (e: L.LeafletMouseEvent) => {
            // If we recently interacted with UI, suppress this click
            if (suppressMapClickRef.current) {
                suppressMapClickRef.current = false;
                return;
            }
            // Find first empty point
            const idx = pointsRef.current[0] ? (pointsRef.current[1] ? -1 : 1) : 0;
            if (idx === -1) {
                // both points exist, reset
                clearAll();
                pointsRef.current[0] = L.latLng(e.latlng.lat, e.latlng.lng);
            } else {
                pointsRef.current[idx] = L.latLng(e.latlng.lat, e.latlng.lng);
            }
            recomputeLineAndMarkers();
            setTick((t) => t + 1);
        };

        map.on("click", onClick);

        return () => {
            map.off("click", onClick);
            clearAll();
        };
    }, [map, enabled]);

    // removed continuous watch effects; single-shot `setPointToCurrent` will be used

    return (
        <div
            className="leaflet-control m-2 flex flex-col gap-2"
            onPointerDownCapture={() => {
                suppressMapClickRef.current = true;
            }}
            onMouseDownCapture={() => {
                suppressMapClickRef.current = true;
            }}
            onClickCapture={() => {
                suppressMapClickRef.current = true;
            }}
        >
            <Button
                onClick={(e) => {
                    e.stopPropagation();
                    suppressMapClickRef.current = true;
                    setEnabled(!enabled);
                    if (enabled) {
                        // turning off should clear
                        clearAll();
                    }
                }}
            >
                {enabled ? "Measuring: On" : "Measure"}
            </Button>
            {enabled && (
                <div className="bg-popover p-2 rounded-md w-56 text-sm">
                    <div className="flex flex-row items-center justify-between gap-2">
                        <div>
                                <div className="font-semibold">Point A</div>
                                <div className="text-sm text-gray-300">
                                    {loadingA ? "Loading..." : formatCoords(pointsRef.current[0])}
                                </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={(e) => { e.stopPropagation(); suppressMapClickRef.current = true; setPointToCurrent(0); }} title="Set to current location">
                                <LocateIcon />
                            </Button>
                            <Button onClick={(e) => { e.stopPropagation(); handleEditPoint(0); }} title="Edit coordinates">
                                <Edit3 />
                            </Button>
                        </div>
                    </div>

                    <div className="flex flex-row items-center justify-between gap-2 mt-2">
                        <div>
                            <div className="font-semibold">Point B</div>
                            <div className="text-sm text-gray-300">
                                {loadingB ? "Loading..." : formatCoords(pointsRef.current[1])}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={(e) => { e.stopPropagation(); suppressMapClickRef.current = true; setPointToCurrent(1); }} title="Set to current location">
                                <LocateIcon />
                            </Button>
                            <Button onClick={(e) => { e.stopPropagation(); handleEditPoint(1); }} title="Edit coordinates">
                                <Edit3 />
                            </Button>
                        </div>
                    </div>

                    <div className="mt-2">
                        <div className="flex gap-2 items-center">
                            <div className="font-semibold">Distance:</div>
                            <div className="text-blue-500">
                                {computeDistanceText() || "Set two points"}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                clearAll();
                            }}
                        >
                            Reset
                        </Button>
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                setEnabled(false);
                                clearAll();
                            }}
                        >
                            Close
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
