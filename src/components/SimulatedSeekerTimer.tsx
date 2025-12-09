import { useStore } from "@nanostores/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { simulatedSeekerMode, simulatedSeekerGameStartTime } from "@/lib/context";

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
    const [enabled, setEnabled] = useState(false);
    const [, setTick] = useState(0);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        // Only keep update when enabled
        if (!enabled) {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }

        intervalRef.current = window.setInterval(() => {
            setTick((t) => t + 1);
        }, 1000);

        return () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled]);

    const now = Date.now();

    // If the mode becomes disabled, hide the widget (Map already hides it, but guard here too)
    if ($mode === false) return null;

    return (
        <div
            className="leaflet-control m-2 flex flex-col gap-2"
            onPointerDownCapture={() => {}}
            onMouseDownCapture={() => {}}
            onClickCapture={() => {}}
        >
            <Button
                onClick={(e) => {
                    e.stopPropagation();
                    setEnabled(!enabled);
                }}
            >
                {enabled ? "Seeker Timer: On" : "Seeker Timer"}
            </Button>

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
                            <div className="text-sm text-gray-300">
                                {($start === null) ? "Not started" : formatTimestamp($start + Math.floor((now - $start) * 5))}
                            </div>

                            <div className="mt-2">
                                <div className="font-semibold">In-game elapsed</div>
                                <div className="text-blue-500">{formatElapsed($start, now, 5)}</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                simulatedSeekerGameStartTime.set(Date.now());
                            }}
                        >
                            Reset
                        </Button>
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                simulatedSeekerGameStartTime.set(null);
                            }}
                        >
                            Clear
                        </Button>
                        <Button
                            onClick={(e) => {
                                e.stopPropagation();
                                setEnabled(false);
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
