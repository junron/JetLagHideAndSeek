import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");

describe("PWA update lifecycle", () => {
    it("activates a newly installed worker immediately and reloads controlled tabs", () => {
        const worker = source("../src/sw.ts");
        const registration = source("../src/pwa.ts");

        expect(worker).toContain("self.skipWaiting()");
        expect(worker).toContain("self.clients.claim()");
        expect(registration).toContain('"controllerchange"');
        expect(registration).toContain("window.location.reload()");
    });
});
