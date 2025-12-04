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


export const international_borders: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { name: "Causeway" },
            geometry: { type: "Point", coordinates: [103.76917898654938, 1.452598503901771] },
        },
        {
            type: "Feature",
            properties: { name: "Second Link" },
            geometry: { type: "Point", coordinates: [103.63447576761249, 1.3497370633490116] },
        },
    ],
};