import { describe, expect, it } from "vitest";

import { applyAnswer, extractAnswer } from "@/game/multiplayer";
import { PHOTO_QUESTIONS } from "@/game/photoQuestions";
import { questionSchema } from "@/maps/schema";

describe("photo questions", () => {
    it("includes every base and medium photo prompt from the Singapore rules", () => {
        expect(PHOTO_QUESTIONS).toHaveLength(14);
        expect(
            PHOTO_QUESTIONS.find((item) => item.id === "tree"),
        ).toMatchObject({
            label: "Tree",
            instructions: "Include the entire tree.",
        });
        expect(
            PHOTO_QUESTIONS.find((item) => item.id === "restaurant_interior"),
        ).toMatchObject({
            instructions:
                "No zoom. Take the picture through the window from outside the restaurant.",
        });
    });

    it("parses a photo question with local display defaults", () => {
        expect(
            questionSchema.parse({
                id: "photo",
                key: 7,
                data: { subject: "tree" },
            }),
        ).toEqual({
            id: "photo",
            key: 7,
            data: {
                subject: "tree",
                collapsed: false,
                drag: false,
                response: "unanswered",
            },
        });
    });

    it("applies and extracts photo answers", () => {
        const question = questionSchema.parse({
            id: "photo",
            key: 7,
            data: { subject: "tree" },
        });
        const answered = applyAnswer(question, {
            type: "photo",
            response: "photo",
            uploadId: "53a6b836-f89d-4d3a-8757-e791de08d42b",
        });
        expect(answered.data).toMatchObject({
            response: "photo",
            uploadId: "53a6b836-f89d-4d3a-8757-e791de08d42b",
        });
        expect(extractAnswer(answered)).toEqual({
            type: "photo",
            response: "photo",
            uploadId: "53a6b836-f89d-4d3a-8757-e791de08d42b",
        });
    });
});
