import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const mapSource = readFileSync("src/components/Map.tsx", "utf8");

describe("MRT station marker layering", () => {
    it("renders interactive station dots in a pane above the blue overlay", () => {
        expect(mapSource).toContain(
            'const STATION_DOT_PANE = "station-dots";',
        );
        expect(mapSource).toContain('stationPane.style.zIndex = "450";');
        expect(mapSource).toMatch(
            /L\.circleMarker\(latlng, \{[\s\S]*?pane: STATION_DOT_PANE,[\s\S]*?\}\)/,
        );
        expect(mapSource).not.toMatch(
            /const g = L\.geoJSON\(mapGeoData, \{[\s\S]*?pane: STATION_DOT_PANE/,
        );
    });
});
