import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
    customStations,
    simulatedSeekerDestination,
    simulatedSeekerGameStartTime,
    simulatedSeekerMode,
    simulatedSeekerTimeScale,
} from "@/lib/context";
import { computeShortestPathBetweenStations, findNearestStationByCoords } from "@/maps/api/sgmrt";

const formatTimestamp = (t: number | null) => {
    if (!t) return "Not started";
    try {
        const d = new Date(t);
        return d.toLocaleTimeString();
    } catch (e) {
        return "Invalid";
    }
};

const formatElapsed = (start: number | null, now: number, multiplier: number = 1) => {
    if (!start) return "Not started";
    const ms = Math.floor((now - start) * multiplier);
    if (ms < 1000) return "0s";
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
};

export const SimulatedSeekerTimer = () => {
    const $mode = useStore(simulatedSeekerMode);
    const $start = useStore(simulatedSeekerGameStartTime);
    const $customStations = useStore(customStations);
    const $destination = useStore(simulatedSeekerDestination);
    const $timeScale = useStore(simulatedSeekerTimeScale);

    const stationOptions = useMemo(() => {
        const obj: Record<string, string> = {};
        if ($customStations && $customStations.length > 0) {
            const sorted = [...$customStations].sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
            for (const s of sorted) obj[String(s.id)] = s.name || String(s.id);
        }
        return obj;
    }, [$customStations]);

    const [enabled, setEnabled] = useState(false);
    const [, setTick] = useState(0);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        if (!enabled) {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }
        intervalRef.current = window.setInterval(() => setTick((t) => t + 1), 1000);
        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled]);

    const now = Date.now();

    const [isAnimating, setIsAnimating] = useState(false);
    const animRef = useRef<{ cancelled: boolean; gen: number }>({ cancelled: false, gen: 0 });

    const startAnimate = useCallback(async (destId: string, gen: number) => {
        animRef.current.cancelled = false;
        animRef.current.gen = gen;
        setIsAnimating(true);
        try {
            const curModeRef = simulatedSeekerMode.get();
            const startCoords = curModeRef ? [curModeRef.longitude, curModeRef.latitude] : undefined;
            let startFeature: any = null;
            if (startCoords) startFeature = await findNearestStationByCoords(startCoords as any);
            const startIdentifier = startFeature ? startFeature.properties?.["name:en"] || startFeature.properties?.name : undefined;
            const path = await computeShortestPathBetweenStations(startIdentifier ? String(startIdentifier) : (startFeature?.properties?.name || ""), destId);
            console.log({path});
            if (!path) return setIsAnimating(false);
            for (const seg of path.segments) {
                for (let i = 1; i < seg.coords.length; i++) {
                    if (animRef.current.cancelled || animRef.current.gen !== gen) return setIsAnimating(false);
                    const a = seg.coords[i - 1];
                    const b = seg.coords[i];
                    const pieceDist = turf.distance(turf.point(a), turf.point(b), { units: "kilometers" });
                    const subDurationSec = seg.distance_km > 0 ? (pieceDist / seg.distance_km) * seg.duration_seconds : 0;
                    const effectiveMs = (subDurationSec * 1000) / ($timeScale || 1);
                    await new Promise<void>((resolve) => {
                        const start = performance.now();
                        let rafId: number | null = null;
                        const frame = (t: number) => {
                            if (animRef.current.cancelled || animRef.current.gen !== gen) {
                                if (rafId) cancelAnimationFrame(rafId);
                                resolve();
                                return;
                            }
                            const elapsed = t - start;
                            const ratio = Math.min(1, effectiveMs > 0 ? elapsed / effectiveMs : 1);
                            const lng = a[0] + (b[0] - a[0]) * ratio;
                            const lat = a[1] + (b[1] - a[1]) * ratio;
                            simulatedSeekerMode.set({ latitude: lat, longitude: lng });
                            if (ratio >= 1) return resolve();
                            rafId = requestAnimationFrame(frame);
                        };
                        rafId = requestAnimationFrame(frame);
                    });
                }
            }
            // ensure final seeker position matches the last station coordinates exactly
            if (path && path.stations && path.stations.length > 0) {
                const last = path.stations[path.stations.length - 1];
                if (last && last.coords) {
                    simulatedSeekerMode.set({ latitude: last.coords[1], longitude: last.coords[0] });
                }
            }
        } finally {
            setIsAnimating(false);
        }
    }, [$timeScale]);

    useEffect(() => {
        if (!$destination) {
            if (isAnimating) {
                animRef.current.cancelled = true;
                animRef.current.gen = animRef.current.gen + 1;
                setIsAnimating(false);
            }
            return;
        }
        if (isAnimating) {
            animRef.current.cancelled = true;
            const gen = animRef.current.gen + 1;
            animRef.current.gen = gen;
            startAnimate($destination, gen);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [$destination]);

    if ($mode === false) return null;

    return (
        <div className="leaflet-control m-2 flex flex-col gap-2" onPointerDownCapture={() => {}} onMouseDownCapture={() => {}} onClickCapture={() => {}}>
            <Button onClick={(e) => { e.stopPropagation(); setEnabled(!enabled); }}>{enabled ? "Seeker Timer: On" : "Seeker Timer"}</Button>
            {enabled && (
                <div className="bg-popover p-2 rounded-md w-72 text-sm">
                    <div className="flex flex-row items-start justify-between gap-4">
                        <div className="flex-1">
                            <div className="font-semibold">Current time</div>
                            <div className="text-sm text-gray-300">{new Date(now).toLocaleTimeString()}</div>
                            <div className="mt-2">
                                <div className="font-semibold">Game start</div>
                                <div className="text-sm text-gray-300">{formatTimestamp($start)}</div>
                            </div>
                            <div className="mt-2">
                                <div className="font-semibold">Elapsed</div>
                                <div className="text-blue-500">{formatElapsed($start, now)}</div>
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="font-semibold">In-game time</div>
                            <div className="text-sm text-gray-300">{$start === null ? "Not started" : formatTimestamp($start + Math.floor((now - $start) * ($timeScale || 1)))}</div>
                            <div className="mt-2">
                                <div className="font-semibold">In-game elapsed</div>
                                <div className="text-blue-500">{formatElapsed($start, now, $timeScale || 1)}</div>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                        <Button onClick={(e) => { e.stopPropagation(); simulatedSeekerGameStartTime.set(Date.now()); }}>Reset</Button>
                        <Button onClick={(e) => { e.stopPropagation(); simulatedSeekerGameStartTime.set(null); }}>Clear</Button>
                        <Button onClick={(e) => { e.stopPropagation(); setEnabled(false); }}>Close</Button>
                    </div>
                    <div className="mt-3">
                        <div className="font-semibold">Destination</div>
                        <div className="mt-1">
                            <Select trigger={{ placeholder: "Choose destination", className: "" }} options={stationOptions} value={$destination ?? ""} onValueChange={(v: string) => simulatedSeekerDestination.set(v || null)} />
                        </div>
                        <div className="flex gap-2 mt-2">
                            <Button onClick={(e) => { e.stopPropagation(); if (!$destination) return; const found = ($customStations || []).find((s: any) => String(s.id) === $destination); if (found) simulatedSeekerMode.set({ latitude: found.lat, longitude: found.lng }); }} disabled={!$destination}>Move to Destination</Button>
                            <Button onClick={(e) => { e.stopPropagation(); if (!$destination) return; animRef.current.cancelled = true; const gen = (animRef.current.gen || 0) + 1; animRef.current.gen = gen; startAnimate($destination, gen); }} disabled={!$destination || isAnimating}>{isAnimating ? "Animating..." : "Animate to Destination"}</Button>
                            <Button onClick={(e) => { e.stopPropagation(); simulatedSeekerDestination.set(null); }}>Clear Destination</Button>
                        </div>
                        {($destination && $customStations) && (() => { const s = ($customStations || []).find((st: any) => String(st.id) === $destination); if (!s) return null; return (<div className="mt-2 text-sm text-gray-300"><div className="font-semibold">Selected destination</div><div>{s.name}</div><div className="text-xs">{(s.lat && s.lng) ? `lat: ${s.lat.toFixed(6)}, lng: ${s.lng.toFixed(6)}` : "Coordinates unknown"}</div></div>); })()}
                    </div>
                </div>
            )}
        </div>
    );
};

// Cleaned: removed accidental appended commentary
