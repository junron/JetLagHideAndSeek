import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");

const schema = read("../src/maps/schema.ts");
const api = read("../src/maps/api/overpass.ts");
const measuring = read("../src/maps/questions/measuring.ts");
const markers = read("../src/components/DraggableMarkers.tsx");

describe("expressway question removal", () => {
    it("removes the question, runtime code, tests, and bundled dataset", () => {
        expect(schema).not.toContain('z.literal("expressway")');
        expect(api).not.toContain("Expressways.geojson");
        expect(api).not.toContain("nearestExpresswayToPoint");
        expect(measuring).not.toContain('case "expressway"');
        expect(markers).not.toContain("nearestExpresswayToPoint");
        expect(
            existsSync(
                new URL("../public/Expressways.geojson", import.meta.url),
            ),
        ).toBe(false);
    });
});
