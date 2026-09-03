import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/sw.ts", import.meta.url), "utf8");
const clientSource = readFileSync(
    new URL("../src/game/multiplayer.ts", import.meta.url),
    "utf8",
);
const nginxSource = readFileSync(
    new URL("../deploy/nginx/map.jro.sg.conf", import.meta.url),
    "utf8",
);

function pngDimensions(path: string) {
    const png = readFileSync(new URL(path, import.meta.url));
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe("push notification presentation", () => {
    it("uses dedicated high-contrast notification artwork", () => {
        expect(source).toContain('icon: "/notification-icon-v3.png"');
        expect(source).toContain('badge: "/notification-badge-v3.png"');
        expect(source).toContain('image: "/notification-banner-v2.png"');
        expect(clientSource).toContain('icon: "/notification-icon-v3.png"');
        expect(clientSource).toContain('badge: "/notification-badge-v3.png"');
        expect(clientSource).toContain('image: "/notification-banner-v2.png"');
        expect(nginxSource).toContain("notification-icon-v3");
        expect(nginxSource).toContain("notification-badge-v3");
        expect(nginxSource).toContain("notification-banner-v2");
        expect(pngDimensions("../public/notification-icon-v3.png")).toEqual([
            192, 192,
        ]);
        expect(pngDimensions("../public/notification-badge-v3.png")).toEqual([
            96, 96,
        ]);
        expect(pngDimensions("../public/notification-banner-v2.png")).toEqual([
            1200, 600,
        ]);
    });

    it("requests a long, repeated vibration for each fresh push", () => {
        expect(source).toContain("vibrate: [700, 120, 700, 120, 1400]");
        expect(source).toContain("renotify: true");
        expect(source).toContain("silent: false");
        expect(clientSource).toContain("vibrate: [700, 120, 700, 120, 1400]");
        expect(clientSource).toContain("silent: false");
    });
});
