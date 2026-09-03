import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const serverSource = readFileSync(
    new URL("../server/src/app.ts", import.meta.url),
    "utf8",
);
const questionCardSource = readFileSync(
    new URL("../src/components/cards/base.tsx", import.meta.url),
    "utf8",
);

describe("game-wide pending question invariant", () => {
    it("migrates from the per-seeker index to a game-wide partial unique index", () => {
        expect(serverSource).toContain(
            "DROP INDEX IF EXISTS one_pending_question_per_seeker",
        );
        expect(serverSource).toContain(
            "CREATE UNIQUE INDEX IF NOT EXISTS one_pending_question_per_game",
        );
        expect(serverSource).toContain(
            "ON questions(game_id) WHERE status = 'pending'",
        );
    });

    it("explains that another seeker's pending question can block sending", () => {
        expect(questionCardSource).toContain(
            '"Wait for the pending question to be answered"',
        );
        expect(questionCardSource).not.toContain(
            '"Wait for your pending question to be answered"',
        );
    });
});
