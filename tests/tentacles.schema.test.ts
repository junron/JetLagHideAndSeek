import { describe, it, expect } from "vitest";
import { questionSchema, type Question } from "@/maps/schema";

describe("question schema default values", () => {
    it("parses a minimal tentacles question with defaults", () => {
        const q: Partial<Question> = { id: "tentacles", data: { lat: 1, lng: 2 } } as any;
        const parsed = questionSchema.parse(q);
        expect(parsed.id).toBe("tentacles");
        expect(parsed.data).toHaveProperty("locationType");
        expect(parsed.data).toHaveProperty("lat");
        expect(parsed.data).toHaveProperty("lng");
    });
});
