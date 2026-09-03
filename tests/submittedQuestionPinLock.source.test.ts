import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const markerSource = readFileSync(
    new URL("../src/components/DraggableMarkers.tsx", import.meta.url),
    "utf8",
);

describe("submitted question pin locking", () => {
    it("disables marker dragging and editing once the local question is authoritative", () => {
        expect(markerSource).toContain("submittedQuestionKeys");
        expect(markerSource).toContain(
            "if (!question.data.drag && !submitted) return null;",
        );
        expect(markerSource).toContain("draggable={!submitted}");
        expect(markerSource).toContain("if (!submitted && !isDragging)");
    });
});
