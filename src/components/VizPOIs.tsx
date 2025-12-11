import { useStore } from "@nanostores/react";
import { useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogFooter,DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { vizPOIsActive, vizPOIsCategory } from "@/lib/context";

import { Button } from "./ui/button";

const options = [
    { key: null, label: "Off" },
    { key: "museums", label: "Museums" },
    { key: "parks", label: "Parks" },
    { key: "libraries", label: "Libraries" },
    { key: "supermarkets", label: "Supermarkets" },
    { key: "hawker", label: "Hawker" },
    { key: "airports", label: "Airports" },
    { key: "golf_courses", label: "Golf Courses" },
    { key: "mountains", label: "Mountains" },
];

export const VizPOIs = () => {
    const $active = useStore(vizPOIsActive);
    const $category = useStore(vizPOIsCategory);
    const [, setTick] = useState(0);

        const setCategory = (k: string | null) => {
            vizPOIsCategory.set(k);
            // Do not change vizPOIsActive here; the dialog open/close state
            // is independent of whether POIs are visible on the map.
            setTick((t) => t + 1);
        };

    return (
            <Dialog open={$active} onOpenChange={(v) => vizPOIsActive.set(v)}>
                <DialogTrigger asChild>
                    <Button>{$active ? "Viz POIs: On" : "Viz POIs"}</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Viz POIs</DialogTitle>
                    </DialogHeader>
                    <DialogDescription>Choose a point of interest category to visualize</DialogDescription>
                    <div className="mt-4 grid gap-2">
                        {options.map((o) => (
                            <label key={String(o.key)} className={`flex gap-2 items-center cursor-pointer ${$category === o.key ? "text-blue-500" : "text-gray-300"}`}>
                                <input
                                    type="radio"
                                    name="viz-pois"
                                    checked={$category === o.key}
                                    onChange={() => setCategory(o.key)}
                                />
                                <span className="pl-1">{o.label}</span>
                            </label>
                        ))}
                    </div>
                    <DialogFooter>
                        <div className="flex gap-2">
                            <Button onClick={(e) => { e.stopPropagation(); setCategory(null); }}>Reset</Button>
                            <Button onClick={(e) => { e.stopPropagation(); vizPOIsActive.set(false); }}>Close</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
    );
};

export default VizPOIs;
