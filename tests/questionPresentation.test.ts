import { describe, expect, it } from "vitest";

import {
    initialQuestionCollapsed,
    shouldAutoCollapseQuestion,
} from "@/game/questionPresentation";

describe("answered question collapse behavior", () => {
    it("starts answered questions collapsed regardless of their draft state", () => {
        expect(initialQuestionCollapsed(undefined, "answered")).toBe(true);
        expect(initialQuestionCollapsed(false, "answered")).toBe(true);
        expect(initialQuestionCollapsed(true, "pending")).toBe(true);
        expect(initialQuestionCollapsed(false, "pending")).toBe(false);
    });

    it("auto-collapses only on the transition to answered", () => {
        expect(shouldAutoCollapseQuestion("pending", "answered")).toBe(true);
        expect(shouldAutoCollapseQuestion("answered", "answered")).toBe(false);
        expect(shouldAutoCollapseQuestion(undefined, "answered")).toBe(false);
    });
});
