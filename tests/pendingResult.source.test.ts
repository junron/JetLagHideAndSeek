import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");

const sidebarSource = read("../src/components/QuestionSidebar.tsx");
const [
    radiusSource,
    thermometerSource,
    tentaclesSource,
    matchingSource,
    measuringSource,
] = ["radius", "thermometer", "tentacles", "matching", "measuring"].map(
    (name) => read(`../src/components/cards/${name}.tsx`),
);
const resultCardSources = [
    radiusSource,
    thermometerSource,
    tentaclesSource,
    matchingSource,
    measuringSource,
];

describe("pending seeker result editing", () => {
    it("keeps question definitions locked while enabling geographic result controls", () => {
        expect(sidebarSource).toContain("canEditPendingQuestionResult");
        expect(sidebarSource).toContain("resultEditable");
        for (const source of resultCardSources) {
            expect(source).toContain("resultEditable");
        }
    });

    it("keeps pending owner result choices active for every geographic question family", () => {
        expect(sidebarSource).toContain(
            "localPendingQuestion ?? gameQuestion.question",
        );
        for (const source of [
            radiusSource,
            thermometerSource,
            measuringSource,
        ]) {
            expect(source).toContain("(!data.drag && !resultEditable)");
        }
        expect(matchingSource).toContain(
            "!!$hiderMode || (!data.drag && !resultEditable) || $isLoading",
        );
        expect(tentaclesSource).toContain(
            "disabled={(!data.drag && !resultEditable) || $isLoading}",
        );
    });
});
