import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
    new URL("../src/sw.ts", import.meta.url),
    "utf8",
);
const astroConfig = readFileSync(
    new URL("../astro.config.mjs", import.meta.url),
    "utf8",
);

describe("network-only service worker", () => {
    it("keeps push support without precaching application files", () => {
        expect(workerSource).not.toContain("workbox-precaching");
        expect(workerSource).not.toContain("precacheAndRoute");
        expect(workerSource).not.toContain("__WB_MANIFEST");
        expect(workerSource).not.toContain('addEventListener("fetch"');
        expect(workerSource).toContain('addEventListener("push"');
        expect(astroConfig).toContain("injectionPoint: undefined");
        expect(astroConfig).not.toContain("globPatterns:");
        expect(astroConfig).not.toContain("manifestTransforms:");
    });

    it("deletes only this service worker scope's legacy Workbox caches", () => {
        expect(workerSource).toContain("caches.keys()");
        expect(workerSource).toContain('cacheName.startsWith("workbox-")');
        expect(workerSource).toContain(
            "cacheName.endsWith(self.registration.scope)",
        );
        expect(workerSource).toContain("caches.delete(cacheName)");
    });
});
