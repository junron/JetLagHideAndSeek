import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { questionSchema } from "@/maps/schema";

const thermometerCard = readFileSync(
    new URL("../src/components/cards/thermometer.tsx", import.meta.url),
    "utf8",
);
const draggableMarkers = readFileSync(
    new URL("../src/components/DraggableMarkers.tsx", import.meta.url),
    "utf8",
);

describe("thermometer endpoint colors", () => {
    it("defaults new thermometer questions to a green start and red end", () => {
        const question = questionSchema.parse({
            id: "thermometer",
            data: { latA: 1, lngA: 2, latB: 3, lngB: 4 },
        });

        expect(question.data.colorA).toBe("green");
        expect(question.data.colorB).toBe("red");
    });

    it("renders fixed endpoint colors for existing thermometer questions", () => {
        expect(thermometerCard).toContain(
            'label="Start"\n                colorName="green"',
        );
        expect(thermometerCard).toContain(
            'label="End"\n                colorName="red"',
        );
        expect(draggableMarkers).toContain(
            'color="green"\n                                    key={"a"',
        );
        expect(draggableMarkers).toContain(
            'color="red"\n                                    key={"b"',
        );
    });
});
