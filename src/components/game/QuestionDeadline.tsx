import React from "react";

import { questionDeadlineState } from "@/game/multiplayer";

type Props = {
    answerDueAt?: string;
    status: "pending" | "answered";
    answeredLate?: boolean | null;
    nowMs?: number;
};

function formatDuration(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function QuestionDeadline({
    answerDueAt,
    status,
    answeredLate,
    nowMs,
}: Props) {
    const [currentTime, setCurrentTime] = React.useState(nowMs ?? Date.now());

    React.useEffect(() => {
        if (nowMs !== undefined || status === "answered") return;
        const interval = window.setInterval(
            () => setCurrentTime(Date.now()),
            1000,
        );
        return () => window.clearInterval(interval);
    }, [nowMs, status]);

    if (status === "answered") {
        if (!answeredLate) return null;
        return (
            <div
                className="mt-1 text-xs font-medium text-slate-400"
                role="status"
            >
                Answered after deadline
            </div>
        );
    }
    if (!answerDueAt) return null;
    const state = questionDeadlineState(
        answerDueAt,
        status,
        nowMs ?? currentTime,
    );
    if (state.kind === "overdue") {
        return (
            <div
                className="mt-1 text-xs font-medium text-amber-700"
                role="status"
            >
                Overdue by {formatDuration(state.milliseconds)}
            </div>
        );
    }
    return (
        <div className="mt-1 text-xs font-medium text-amber-700" role="timer">
            Answer due in {formatDuration(state.milliseconds)}
        </div>
    );
}
