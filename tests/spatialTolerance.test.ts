import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ONE_METER_IN_DEGREES } from "@/maps/geo-utils/precision";
import { connectToSeparateLines } from "@/maps/geo-utils/special";

const read = (path: string) => readFileSync(path, "utf8");
const toleranceSources = [
    "src/components/ZoneSidebar.tsx",
    "src/maps/api/overpass.ts",
    "src/maps/questions/matching.ts",
    "src/maps/questions/measuring.ts",
].map(read);

describe("one-meter spatial tolerances", () => {
    it("uses a conservative one-meter angular simplification tolerance", () => {
        expect(ONE_METER_IN_DEGREES).toBeGreaterThan(0);
        expect(ONE_METER_IN_DEGREES).toBeLessThanOrEqual(
            0.000008993203637245379,
        );

        for (const source of toleranceSources) {
            expect(source).not.toMatch(/tolerance:\s*(?:0\.001|0\.0005)/);
            for (const match of source.matchAll(/tolerance:\s*([^,\n]+)/g)) {
                expect(match[1].trim()).toBe("ONE_METER_IN_DEGREES");
            }
        }
    });

    it("does not join line segments separated by more than one meter", () => {
        const onePointOneMetersInDegrees =
            1.1 * 0.000008993203637245379;
        const result = connectToSeparateLines([
            [
                [0, 0],
                [0.001, 0],
            ],
            [
                [0.001 + onePointOneMetersInDegrees, 0],
                [0.002, 0],
            ],
        ]);

        expect(result).toHaveLength(2);
    });

    it("uses one-meter precision for projected Voronoi boundaries", () => {
        const voronoi = read("src/maps/geo-utils/voronoi.ts");

        expect(voronoi).not.toContain("precision(0.005)");
        expect(voronoi).toContain("const ONE_METER_IN_PROJECTED_UNITS = 1 / ratio");
        expect(voronoi).toContain(".precision(ONE_METER_IN_PROJECTED_UNITS)");
    });

    it("removes the old 100-meter simplification claims", () => {
        const matchingCard = read("src/components/cards/matching.tsx");
        const tutorial = read("src/components/TutorialDialog.tsx");

        expect(matchingCard).not.toContain("100 meters");
        expect(tutorial).not.toContain(
            "Simplified to ±100 meters for browser performance",
        );
        expect(tutorial).toContain(
            "Simplified to ±1 meter for browser performance",
        );
    });

    it("does not use 500-meter MRT line-association tolerances", () => {
        const mrt = read("src/maps/api/sgmrt.ts");

        expect(mrt).not.toMatch(/tolerance\s*~\s*0\.5 km/i);
        expect(mrt).not.toMatch(/\bd\s*<=\s*0\.5\b/);
    });
});
