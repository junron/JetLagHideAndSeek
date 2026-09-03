import type { Feature, FeatureCollection, Point } from "geojson";

import type { CustomStation } from "./types";

export function normalizeToStationFeatures(stations: CustomStation[]) {
    // Return GeoJSON FeatureCollection of Points carrying properties { id, name }
    const features: Feature<Point>[] = stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lng, s.lat] },
        properties: { id: s.id, name: s.name },
    }));
    return { type: "FeatureCollection", features } as FeatureCollection<Point>;
}
