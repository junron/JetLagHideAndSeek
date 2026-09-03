import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
    new URL("../src/components/game/MultiplayerPanel.tsx", import.meta.url),
    "utf8",
);

describe("multiplayer game status bar", () => {
    it("keeps an opaque black background in every device theme and interaction state", () => {
        expect(panelSource).toContain(
            'className="pointer-events-auto h-10 gap-2 !bg-black px-3 text-white shadow-lg hover:!bg-black"',
        );
    });
});
