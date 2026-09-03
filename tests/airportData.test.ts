import { describe, expect, it } from "vitest";

import { airports } from "@/maps/api/data";

describe("bundled geographic data", () => {
    it("keeps every airport coordinate in longitude-latitude order within Singapore", () => {
        for (const airport of airports.features) {
            const [longitude, latitude] = airport.geometry.coordinates;
            expect(longitude, airport.properties?.name).toBeGreaterThanOrEqual(
                103.5,
            );
            expect(longitude, airport.properties?.name).toBeLessThanOrEqual(
                104.1,
            );
            expect(latitude, airport.properties?.name).toBeGreaterThanOrEqual(
                1.15,
            );
            expect(latitude, airport.properties?.name).toBeLessThanOrEqual(1.5);
        }
    });
});
