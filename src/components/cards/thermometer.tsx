import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";

import { LatitudeLongitude } from "@/components/LatLngPicker";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
    defaultUnit,
    hiderMode,
    isLoading,
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import type { ThermometerQuestion } from "@/maps/schema";

import { QuestionCard } from "./base";

export const ThermometerQuestionComponent = ({
    data,
    questionKey,
    sub,
    className,
}: {
    data: ThermometerQuestion;
    questionKey: number;
    sub?: string;
    className?: string;
}) => {
    useStore(triggerLocalRefresh);
    const $hiderMode = useStore(hiderMode);
    const $questions = useStore(questions);
    const $isLoading = useStore(isLoading);
    const label = `Thermometer
    ${
        $questions
            .filter((q) => q.id === "thermometer")
            .map((q) => q.key)
            .indexOf(questionKey) + 1
    }`;

    return (
        <QuestionCard
            questionKey={questionKey}
            label={label}
            sub={sub}
            className={className}
            collapsed={data.collapsed}
            setCollapsed={(collapsed) => {
                data.collapsed = collapsed; // Doesn't trigger a re-render so no need for questionModified
            }}
            locked={!data.drag}
            setLocked={(locked) => questionModified((data.drag = !locked))}
        >
            <LatitudeLongitude
                latitude={data.latA}
                longitude={data.lngA}
                label="Start"
                colorName={data.colorA}
                onChange={(lat, lng) => {
                    if (lat !== null) {
                        data.latA = lat;
                    }
                    if (lng !== null) {
                        data.lngA = lng;
                    }
                    questionModified();
                }}
                disabled={!data.drag || $isLoading}
            />
            <LatitudeLongitude
                latitude={data.latB}
                longitude={data.lngB}
                label="End"
                colorName={data.colorB}
                onChange={(lat, lng) => {
                    if (lat !== null) {
                        data.latB = lat;
                    }
                    if (lng !== null) {
                        data.lngB = lng;
                    }
                    questionModified();
                }}
                disabled={!data.drag || $isLoading}
            />
            <div className="flex gap-2 items-center p-2">
                <Label
                    className={cn(
                        "font-semibold text-lg",
                        $isLoading && "text-muted-foreground",
                    )}
                >
                    Distance
                </Label>
                <div className="text-sm ml-auto text-right">
                    {(() => {
                        try {
                            const a = turf.point([data.lngA, data.latA]);
                            const b = turf.point([data.lngB, data.latB]);
                            if (defaultUnit.get() === "miles") {
                                const miles = turf.distance(a, b, { units: "miles" });
                                return `${miles.toFixed(2)} miles`;
                            }
                            if (defaultUnit.get() === "meters") {
                                const km = turf.distance(a, b, { units: "kilometers" });
                                const meters = Math.round(km * 1000);
                                if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
                                return `${meters.toFixed(0)} m`;
                            }
                            // default to kilometers
                            const km = turf.distance(a, b, { units: "kilometers" });
                            if (km >= 1) return `${km.toFixed(2)} km`;
                            const meters = Math.round(km * 1000);
                            return `${meters.toFixed(0)} m`;
                        } catch (e) {
                            return "";
                        }
                    })()}
                </div>
            </div>
            <div className="flex gap-2 items-center p-2">
                <Label
                    className={cn(
                        "font-semibold text-lg",
                        $isLoading && "text-muted-foreground",
                    )}
                >
                    Result
                </Label>
                <ToggleGroup
                    className="grow"
                    type="single"
                    value={data.warmer ? "warmer" : "colder"}
                    onValueChange={(value: "warmer" | "colder") =>
                        questionModified((data.warmer = value === "warmer"))
                    }
                    disabled={!!$hiderMode || !data.drag || $isLoading}>
                    <ToggleGroupItem color="red" value="colder">
                        Colder
                    </ToggleGroupItem>
                    <ToggleGroupItem value="warmer">Warmer</ToggleGroupItem>
                </ToggleGroup>
            </div>
        </QuestionCard>
    );
};
