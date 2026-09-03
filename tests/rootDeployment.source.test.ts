import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");

const astroConfig = read("../astro.config.mjs");
const client = read("../src/game/multiplayer.ts");
const worker = read("../src/sw.ts");
const server = read("../server/src/app.ts");
const nginx = read("../deploy/nginx/map.jro.sg.conf");

describe("map.jro.sg root deployment", () => {
    it("uses the root URL for joins and notification links", () => {
        expect(astroConfig).toContain('site: "https://map.jro.sg"');
        expect(client).not.toContain("/map.html");
        expect(worker).not.toContain("/map.html");
        expect(server).not.toContain("/map.html");
        expect(client).toContain('new URL("/", origin)');
        expect(worker).toContain('target.pathname !== "/"');
        expect(server).toContain(
            "url: `/?game=${encodeURIComponent(game.code)}",
        );
    });

    it("ships a root-host nginx configuration with the complete auth boundary", () => {
        expect(nginx).toContain("server_name map.jro.sg;");
        expect(nginx).toContain("location = / {");
        expect(nginx).toContain('add_header Service-Worker-Allowed "/";');
        expect(nginx).toContain("location /api/ {");
        expect(nginx).toContain("location /socket.io/ {");
        expect(nginx).toContain('auth_basic "Jet Lag Map";');
        expect(nginx).not.toContain("/map.html");
    });
});
