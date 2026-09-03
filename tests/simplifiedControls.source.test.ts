import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) =>
    readFileSync(new URL(path, import.meta.url), "utf8");

const options = read("../src/components/OptionDrawers.tsx");
const zoneSidebar = read("../src/components/ZoneSidebar.tsx");
const map = read("../src/components/Map.tsx");
const context = read("../src/lib/context.ts");
const utils = read("../src/lib/utils.ts");
const apiConstants = read("../src/maps/api/constants.ts");
const importers = read("../src/maps/api/importers.ts");
const matching = read("../src/components/cards/matching.tsx");
const measuring = read("../src/components/cards/measuring.tsx");
const customInitDialog = read("../src/components/CustomInitDialog.tsx");

describe("simplified fixed game controls", () => {
    it("always enables the custom station list without exposing station-source controls", () => {
        expect(zoneSidebar).not.toContain("Use custom station list?");
        expect(zoneSidebar).not.toContain("useCustomStations");
        expect(context).not.toContain("useCustomStations");
        expect(zoneSidebar).not.toContain("Import stations from URL");
        expect(zoneSidebar).not.toContain("Include default stations");
        expect(zoneSidebar).not.toContain("Clear Imported");
        expect(zoneSidebar).not.toContain("Import stations from files");
        expect(zoneSidebar).not.toContain('type="file"');
        expect(zoneSidebar).not.toContain("parseCustomStationsFromText");
        expect(importers).not.toContain("parseCustomStationsFromText");
    });

    it("always merges duplicate stations and displays the station count", () => {
        expect(zoneSidebar).not.toContain("Merge duplicated stations?");
        expect(zoneSidebar).not.toContain("mergeDuplicates");
        expect(context).not.toContain("mergeDuplicates");
        expect(context).not.toContain("includeDefaultStations");
        expect(zoneSidebar).toContain("mergeDuplicateStation(");
        expect(zoneSidebar).toContain(" stations in play");
    });

    it("removes Pastebin sharing", () => {
        expect(options).not.toMatch(/pastebin/i);
        expect(context).not.toMatch(/pastebin/i);
        expect(utils).not.toMatch(/pastebin/i);
        expect(apiConstants).not.toMatch(/pastebin/i);
    });

    it("always overlays train lines without a Thunderforest key", () => {
        expect(options).not.toMatch(/highlight train lines|thunderforest/i);
        expect(context).not.toMatch(/highlightTrainLines|thunderforestApiKey/);
        expect(map).not.toMatch(/highlightTrainLines|thunderforest/i);
        expect(map).not.toContain("tiles.openrailwaymap.org");
        expect(map).toContain('fetch("/sgmrt.geojson")');
    });

    it("removes hiding-zone clipboard controls", () => {
        expect(options).not.toContain("Copy Hiding Zone");
        expect(options).not.toContain("Paste Hiding Zone");
    });

    it("always asks how a new custom question should start", () => {
        expect(options).not.toContain("New Custom Question Defaults");
        expect(context).not.toContain("customInitPreference");
        expect(matching).not.toContain("customInitPreference");
        expect(measuring).not.toContain("customInitPreference");
        expect(customInitDialog).not.toContain("Remember my choice");
        expect(matching).toContain("setCustomDialogOpen(true)");
        expect(measuring).toContain("setCustomDialogOpen(true)");
    });

    it("fixes the hiding-zone radius at a code constant of 400 meters", () => {
        expect(context).toContain(
            "export const HIDING_ZONE_RADIUS_METERS = 400",
        );
        expect(context).not.toContain("export const hidingRadius");
        expect(context).not.toContain("export const hidingRadiusUnits");
        expect(zoneSidebar).not.toContain("Hiding Zone Radius");
        expect(zoneSidebar).toContain("HIDING_ZONE_RADIUS_METERS");
        expect(zoneSidebar).toContain('units: "meters"');
    });
});
