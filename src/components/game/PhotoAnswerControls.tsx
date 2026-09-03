import React from "react";
import { toast } from "react-toastify";

import { Button } from "@/components/ui/button";
import {
    type GameQuestion,
    sendAnswer,
    sendPhotoAnswer,
} from "@/game/multiplayer";

export function PhotoAnswerControls({
    question,
    disabled = false,
}: {
    question: GameQuestion;
    disabled?: boolean;
}) {
    const [file, setFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    if (question.question.id !== "photo" || question.status !== "pending") {
        return null;
    }

    const chooseFile = (next: File | null) => {
        if (!next) {
            setFile(null);
            return;
        }
        if (next.size > 10 * 1024 * 1024) {
            toast.error("Photos must be 10 MiB or smaller");
            return;
        }
        if (
            !new Set(["image/jpeg", "image/png", "image/webp"]).has(next.type)
        ) {
            toast.error("Use a JPEG, PNG, or WebP photo");
            return;
        }
        setFile(next);
    };

    const upload = async () => {
        if (!file || busy || disabled) return;
        setBusy(true);
        try {
            await sendPhotoAnswer(question.id, file);
            toast.success("Photo answer sent");
            setFile(null);
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : "Photo upload failed",
            );
        } finally {
            setBusy(false);
        }
    };

    const cannotAnswer = async () => {
        if (busy || disabled) return;
        setBusy(true);
        try {
            await sendAnswer(question.id, {
                type: "photo",
                response: "cannot_answer",
            });
            toast.success("Answer sent");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Could not send answer",
            );
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="w-full space-y-2 rounded-md border border-slate-700 bg-slate-900/50 p-2">
            <label className="block text-xs font-semibold text-slate-200">
                Choose photo
                <input
                    className="mt-1 block w-full text-xs"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy || disabled}
                    onChange={(event) =>
                        chooseFile(event.target.files?.[0] ?? null)
                    }
                />
            </label>
            {previewUrl && (
                <img
                    src={previewUrl}
                    alt="Selected photo preview"
                    className="max-h-56 w-full rounded object-contain"
                />
            )}
            <p className="text-[11px] text-slate-400">
                JPEG, PNG, or WebP; 10 MiB maximum. Location and other embedded
                metadata are removed before storage.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    size="sm"
                    disabled={!file || busy || disabled}
                    onClick={() => void upload()}
                >
                    {busy ? "Uploading…" : "Send photo"}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || disabled}
                    onClick={() => void cannotAnswer()}
                >
                    I cannot answer
                </Button>
            </div>
        </div>
    );
}
