import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");

describe("hider answer controls", () => {
    it("offers only explicit sending because previews update automatically", () => {
        const sidebar = source("../src/components/QuestionSidebar.tsx");
        const panel = source("../src/components/game/MultiplayerPanel.tsx");

        expect(sidebar).not.toMatch(/Recalculate|Calculate\s+answer/);
        expect(panel).not.toMatch(/>\s*Calculate\s+answer\s*</);
        expect(sidebar).toContain("Send answer");
        expect(panel).toMatch(/Send\s+answer/);
    });
});
