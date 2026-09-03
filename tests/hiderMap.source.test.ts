import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const mapSource = readFileSync(
    new URL("../src/components/Map.tsx", import.meta.url),
    "utf8",
);

describe("hider map synchronization", () => {
    it("renders authoritative multiplayer answers and retries after an active refresh", () => {
        expect(mapSource).toContain("selectMapQuestions(");
        expect(mapSource).toContain("isLoading.subscribe");
        expect(mapSource).toContain("$mapQuestions");
    });
});
