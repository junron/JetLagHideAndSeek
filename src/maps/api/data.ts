import type { FeatureCollection, Point } from "geojson";

export const airports: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { name: "Changi Airport" },
            geometry: { type: "Point", coordinates: [103.9868333, 1.3515572] },
        },
        {
            type: "Feature",
            properties: { name: "Seletar Airport" },
            geometry: { type: "Point", coordinates: [103.8671796, 1.4152511] },
        },
    ],
};