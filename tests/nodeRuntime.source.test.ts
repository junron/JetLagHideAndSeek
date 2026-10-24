import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.server", "utf8");
const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const deployment = readFileSync("docs/DEPLOYMENT.md", "utf8");

// Update this minimum when a newer Node LTS security release is adopted.
const patchedLts = "24.22.1";

describe("production Node runtime", () => {
    it("pins the patched LTS container in both build and runtime stages", () => {
        expect(dockerfile).toMatch(
            new RegExp(
                `^ARG NODE_IMAGE=node:${patchedLts}-bookworm-slim@sha256:[a-f0-9]{64}$`,
                "m",
            ),
        );
        expect(dockerfile).toContain("FROM ${NODE_IMAGE} AS build");
        expect(dockerfile).toContain("FROM ${NODE_IMAGE}\n");
    });

    it("uses the same patched Node release for CI and the frontend build", () => {
        expect(
            workflow.match(/node-version: ['"]?24\.22\.1['"]?/g),
        ).toHaveLength(2);
        expect(workflow).not.toMatch(/node-version: 22\b/);
    });

    it("documents the local build prerequisite", () => {
        expect(deployment).toContain(`Node.js ${patchedLts} and pnpm 10.34.5`);
    });

    it("upgrades from the upstream branch that receives security fixes", () => {
        expect(deployment).toContain("git clone --branch master");
        expect(deployment).toContain(
            "https://github.com/junron/JetLagHideAndSeek.git",
        );
        expect(deployment).toContain("git switch master");
    });
});
