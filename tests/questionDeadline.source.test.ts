import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const cardSource = readFileSync(
    new URL("../src/components/cards/base.tsx", import.meta.url),
    "utf8",
);
const sidebarSource = readFileSync(
    new URL("../src/components/QuestionSidebar.tsx", import.meta.url),
    "utf8",
);

describe("multiplayer question deadline rendering", () => {
    it("renders each authoritative deadline once at the sidebar level", () => {
        expect(cardSource.match(/<QuestionDeadline/g) ?? []).toHaveLength(0);
        expect(sidebarSource.match(/<QuestionDeadline/g) ?? []).toHaveLength(1);
    });

    it("places deadline and question actions inside the card's collapsible content", () => {
        const contentStart = cardSource.indexOf("<SidebarGroupContent");
        const footer = cardSource.indexOf("{footer}", contentStart);
        const contentEnd = cardSource.indexOf(
            "</SidebarGroupContent>",
            contentStart,
        );

        expect(cardSource).toContain("footer?: React.ReactNode");
        expect(cardSource).toContain("aria-hidden={isCollapsed}");
        expect(cardSource).toContain("inert={isCollapsed ? true : undefined}");
        expect(footer).toBeGreaterThan(contentStart);
        expect(footer).toBeLessThan(contentEnd);
        expect(sidebarSource).toContain("footer:");
        expect(sidebarSource).toContain("Un-ask");
    });
});
