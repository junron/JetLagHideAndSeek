import { useStore } from "@nanostores/react";

import {
    MENU_ITEM_CLASSNAME,
    SidebarMenuItem,
} from "@/components/ui/sidebar-l";
import { gameSession } from "@/game/multiplayer";
import {
    PHOTO_QUESTIONS,
    photoQuestionDetails,
    type PhotoSubject,
} from "@/game/photoQuestions";
import {
    questionModified,
    questions,
    triggerLocalRefresh,
} from "@/lib/context";
import { cn } from "@/lib/utils";
import type { PhotoQuestion } from "@/maps/schema";

import { QuestionCard } from "./base";

export function PhotoQuestionComponent({
    data,
    questionKey,
    sub,
    displayIndex,
    className,
    status,
    footer,
}: {
    data: PhotoQuestion;
    questionKey: number;
    sub?: string;
    displayIndex?: number;
    className?: string;
    resultEditable?: boolean;
    status?: "pending" | "answered";
    footer?: React.ReactNode;
}) {
    useStore(triggerLocalRefresh);
    const $questions = useStore(questions);
    const $session = useStore(gameSession);
    const details = photoQuestionDetails(data.subject);
    const photoUrl =
        data.response === "photo" &&
        typeof data.uploadId === "string" &&
        $session
            ? `/api/games/${encodeURIComponent($session.code)}/photos/${encodeURIComponent(data.uploadId)}`
            : null;
    const label = `Photo ${
        displayIndex ??
        $questions
            .filter((question) => question.id === "photo")
            .map((question) => question.key)
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
                data.collapsed = collapsed;
            }}
            status={status}
            footer={footer}
        >
            <SidebarMenuItem>
                <div
                    className={cn(
                        MENU_ITEM_CLASSNAME,
                        "flex-col items-stretch gap-2",
                    )}
                >
                    <label
                        className="text-xs font-semibold text-slate-300"
                        htmlFor={`photo-subject-${questionKey}`}
                    >
                        Send me a photo of…
                    </label>
                    <select
                        id={`photo-subject-${questionKey}`}
                        className="rounded-md border border-slate-600 bg-slate-900 p-2 text-sm text-white"
                        value={data.subject}
                        disabled={
                            Boolean(sub) || data.response !== "unanswered"
                        }
                        onChange={(event) =>
                            questionModified(
                                (data.subject = event.target
                                    .value as PhotoSubject),
                            )
                        }
                    >
                        {PHOTO_QUESTIONS.map((question) => (
                            <option key={question.id} value={question.id}>
                                {question.label}
                                {question.mediumOnly ? " (Medium)" : ""}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs leading-relaxed text-slate-300">
                        {details.instructions}
                    </p>
                    <p className="text-[11px] text-slate-400">
                        Use the phone&apos;s normal aspect ratio. Street View
                        and Google Lens are prohibited.
                    </p>
                    {photoUrl && (
                        <a
                            href={photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                        >
                            <img
                                src={photoUrl}
                                alt={`Answer: ${details.label}`}
                                className="max-h-80 w-full rounded-md border border-slate-700 object-contain"
                                loading="lazy"
                            />
                        </a>
                    )}
                    {data.response === "cannot_answer" && (
                        <p className="rounded-md bg-amber-500/15 p-2 text-sm font-semibold text-amber-300">
                            I cannot answer the question — the subject does not
                            exist in the hiding zone.
                        </p>
                    )}
                </div>
            </SidebarMenuItem>
        </QuestionCard>
    );
}
