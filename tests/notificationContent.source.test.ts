import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");
const multiplayer = read("../src/game/multiplayer.ts");
const panel = read("../src/components/game/MultiplayerPanel.tsx");
const server = read("../server/src/app.ts");
const worker = read("../src/sw.ts");

describe("answer notification content and navigation", () => {
    it("uses the answered question summary for the live in-app notification", () => {
        expect(multiplayer).toContain(
            "message: answeredQuestionNotificationText(item)",
        );
        expect(panel).toContain("toast.info(detail.message)");
    });

    it("accepts the hider's one-minute answer reminder", () => {
        expect(worker).toContain('"answer_due_soon"');
        expect(server).toContain('title: "1 minute left"');
        expect(server).toContain(
            "body: `1 minute left to answer ${questionNotificationLabel(question)}`",
        );
    });

    it("opens the game page without targeting a specific question", () => {
        expect(server).not.toContain("&question=");
        expect(worker).toContain(
            'gameTarget.searchParams.set("game", payload.gameCode)',
        );
        expect(worker).toContain("gameTarget.pathname");
        expect(worker).toContain("gameTarget.search");
        expect(panel).not.toContain('search.has("question")');
        expect(panel).not.toContain("game-question-${questionId}");
    });
});
