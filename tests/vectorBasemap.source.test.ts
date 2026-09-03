import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const map = read("src/components/Map.tsx");
const vectorBasemapPath = "src/components/VectorBasemap.tsx";
const vectorBasemap = existsSync(vectorBasemapPath)
    ? read(vectorBasemapPath)
    : "";
const packageJson = JSON.parse(read("package.json"));

describe("street vector basemap", () => {
    it("renders CARTO Voyager vector tiles through MapLibre", () => {
        expect(map).toContain("<VectorBasemap />");
        expect(map).not.toContain("rastertiles/voyager");
        expect(vectorBasemap).toContain(
            "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        );
        expect(vectorBasemap).toContain("maplibreGL(");
        expect(vectorBasemap).toContain("setWorkerUrl(workerUrl)");
        expect(packageJson.dependencies).toMatchObject({
            "@maplibre/maplibre-gl-leaflet": expect.any(String),
            "maplibre-gl": expect.any(String),
        });
    });

    it("keeps the vector canvas available to the map print control", () => {
        expect(vectorBasemap).toContain(
            "canvasContextAttributes: { preserveDrawingBuffer: true }",
        );
    });

    it("keeps required map attribution visible", () => {
        expect(vectorBasemap).toContain("OpenStreetMap");
        expect(vectorBasemap).toContain("CARTO");
        expect(vectorBasemap).toContain("addAttribution");
        expect(vectorBasemap).toContain("removeAttribution");
    });
});
