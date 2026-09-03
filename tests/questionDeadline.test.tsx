import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuestionDeadline } from "@/components/game/QuestionDeadline";

describe("QuestionDeadline", () => {
    it("renders the server deadline as a countdown", () => {
        const html = renderToStaticMarkup(
            <QuestionDeadline
                answerDueAt="2026-07-17T12:05:00.000Z"
                status="pending"
                nowMs={Date.parse("2026-07-17T12:03:30.000Z")}
            />,
        );
        expect(html).toContain("Answer due in 1:30");
    });

    it("shows overdue timing without a gameplay penalty", () => {
        const html = renderToStaticMarkup(
            <QuestionDeadline
                answerDueAt="2026-07-17T12:05:00.000Z"
                status="pending"
                nowMs={Date.parse("2026-07-17T12:05:01.000Z")}
            />,
        );
        expect(html).toContain("Overdue by 0:01");
        expect(html).not.toContain("Hider time is paused");
        expect(html).not.toContain("no card reward");
    });

    it("marks late answers without assigning a penalty", () => {
        const html = renderToStaticMarkup(
            <QuestionDeadline
                answerDueAt="2026-07-17T12:05:00.000Z"
                status="answered"
                answeredLate
            />,
        );
        expect(html).toContain("Answered after deadline");
        expect(html).not.toContain("No card reward");
    });
});
