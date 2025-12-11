import { useStore } from "@nanostores/react";
import * as turf from "@turf/turf";
import React from "react";
import { toast } from "react-toastify";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarMenuButton } from "@/components/ui/sidebar-l";
import { addQuestion, followMe, isLoading, leafletMapContext, simulatedSeekerMode } from "@/lib/context";
import { getCurrentPosition } from "@/lib/utils";

export const AddQuestionDialog = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const $isLoading = useStore(isLoading);
    const [open, setOpen] = React.useState(false);

    const getQuestionStartLocation = async () => {
        if(followMe.get()) {
            const position = await getCurrentPosition(simulatedSeekerMode.get());
            if(position) {
                return { lat: position.coords.latitude, lng: position.coords.longitude };
            }
        }
        const map = leafletMapContext.get();
        if (!map) return null;
        const center = map.getCenter();
        return { lat: center.lat, lng: center.lng };
    }

    const runAddRadius = async () => {
        const center = await getQuestionStartLocation();
        if (!center) return false;
        addQuestion({
            id: "radius",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    const runAddThermometer = async () => {
        const center = await getQuestionStartLocation();
        if (!center) return false;
        const destination = turf.destination([center.lng, center.lat], 2.4, 90, {
            units: "kilometers",
        });

        addQuestion({
            id: "thermometer",
            data: {
                latA: center.lat,
                lngA: center.lng,
                latB: destination.geometry.coordinates[1],
                lngB: destination.geometry.coordinates[0],
            },
        });

        return true;
    };

    const runAddTentacles = async () => {
        const center = await getQuestionStartLocation();
        if (!center) return false;
        addQuestion({
            id: "tentacles",
            // `tentacles` questions require a locationType — default to 'museum'
            // which is one of the permitted values in the schema
            data: { lat: center.lat, lng: center.lng, locationType: "museum" },
        });
        return true;
    };

    const runAddMatching = async () => {
        const center = await getQuestionStartLocation();
        if (!center) return false;
        addQuestion({
            id: "matching",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    const runAddMeasuring = async () => {
        const center = await getQuestionStartLocation();
        if (!center) return false;
        addQuestion({
            id: "measuring",
            data: { lat: center.lat, lng: center.lng },
        });
        return true;
    };

    const runPasteQuestion = async () => {
        if (!navigator || !navigator.clipboard) {
            toast.error("Clipboard API not supported in your browser");
            return false;
        }

        try {
            await toast.promise(
                navigator.clipboard
                    .readText()
                    .then((text) => addQuestion(JSON.parse(text))),
                {
                    pending: "Reading from clipboard",
                    success: "Question added from clipboard!",
                    error: "No valid question found in clipboard",
                },
                { autoClose: 1000 },
            );

            return true;
        } catch {
            return false;
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent>
                <DialogTitle>Add Question</DialogTitle>
                <DialogDescription>
                    Select which question type you would like to add.
                </DialogDescription>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddRadius()) setOpen(false);
                        }}
                        disabled={$isLoading}
                    >
                        Add Radius
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddThermometer()) setOpen(false);
                        }}
                        disabled={$isLoading}
                    >
                        Add Thermometer
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddTentacles()) setOpen(false);
                        }}
                        disabled={$isLoading}
                    >
                        Add Tentacles
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddMatching()) setOpen(false);
                        }}
                        disabled={$isLoading}
                    >
                        Add Matching
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={() => {
                            if (runAddMeasuring()) setOpen(false);
                        }}
                        disabled={$isLoading}
                    >
                        Add Measuring
                    </SidebarMenuButton>
                    <SidebarMenuButton
                        onClick={async () => {
                            const ok = await runPasteQuestion();
                            if (ok) setOpen(false);
                        }}
                        disabled={$isLoading}
                    >
                        Paste Question
                    </SidebarMenuButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};
