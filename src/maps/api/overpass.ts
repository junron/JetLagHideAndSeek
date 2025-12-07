import * as turf from "@turf/turf";
import type { FeatureCollection, MultiPolygon } from "geojson";
import _ from "lodash";
import osmtogeojson from "osmtogeojson";
import {
    additionalMapGeoLocations,
    mapGeoLocation,
} from "@/lib/context";
import { getLineNamesForStationName } from "@/maps/api/sgmrt";
import { safeUnion } from "@/maps/geo-utils";

import { cacheFetch } from "./cache";
import { LOCATION_FIRST_TAG, OVERPASS_API, ELECTORAL_BOUNDARY_GEOJSON } from "./constants";
import type {
    EncompassingTentacleQuestionSchema,
    HomeGameMatchingQuestions,
    HomeGameMeasuringQuestions,
    QuestionSpecificLocation,
} from "./types";
import { CacheType } from "./types";
import { airports, international_borders, mountains } from "./data";

export const getOverpassData = async (
    query: string,
    loadingText?: string,
    cacheType: CacheType = CacheType.CACHE,
) => {
    const response = await cacheFetch(
        `${OVERPASS_API}?data=${encodeURIComponent(query)}`,
        loadingText,
        cacheType,
    );
    const data = await response.json();
    return data;
};

export const determineGeoJSON = async (
    osmId: string,
    osmTypeLetter: "W" | "R" | "N",
): Promise<any> => {
    const osmTypeMap: { [key: string]: string } = {
        W: "way",
        R: "relation",
        N: "node",
    };
    const osmType = osmTypeMap[osmTypeLetter];
    const query = `[out:json];${osmType}(${osmId});out geom;`;
    const data = await getOverpassData(
        query,
        "Loading map data...",
        CacheType.PERMANENT_CACHE,
    );
    const geo = osmtogeojson(data);
    return {
        ...geo,
        features: geo.features.filter(
            (feature: any) => feature.geometry.type !== "Point",
        ),
    };
};

export const findTentacleLocations = async (
    question: EncompassingTentacleQuestionSchema,
    text: string = "Determining tentacle locations...",
) => {
    const query = `
[out:json][timeout:25];
nwr["${LOCATION_FIRST_TAG[question.locationType]}"="${question.locationType}"](around:${turf.convertLength(
        question.radius,
        question.unit,
        "meters",
    )}, ${question.lat}, ${question.lng});
out center;
    `;
    const center = turf.point([question.lng, question.lat]);
    let data = null;
    if(question.locationType.includes("library")){
        data = await fetchLibraries();
    }
    if(question.locationType.includes("museum")){
        data = await fetchMuseums();
    }
    if(question.locationType.includes("airport")){
        data = Object.assign({}, airports);
    }
    if(question.locationType.includes("mountain")){
        data = Object.assign({}, mountains);
    }
    if(question.locationType.includes("international_borders")){
        data = Object.assign({}, international_borders);
    }
    if(question.locationType.includes("hospital")){
        data = await fetchHawkerCenters();
    }
    if(question.locationType.includes("supermarket")){
        data = await fetchSupermarkets();
    }

    if(data != null){
        data.features = data.features.filter((feature: any) => {
            const coords =
                feature?.geometry?.coordinates ??
                (feature?.properties?.lon && feature?.properties?.lat
                    ? [feature.properties.lon, feature.properties.lat]
                    : null);

            if (!coords) return false;

            const pt = turf.point(coords);
            const dist = turf.distance(center, pt, { units: question.unit });
            return dist <= question.radius;
        });
        return data;
    }
    data = await getOverpassData(query, text);
    const elements = data.elements;
    const response = turf.points([]);
    elements.forEach((element: any) => {
        if (!element.tags["name"] && !element.tags["name:en"]) return;
        if (element.lat && element.lon) {
            const name = element.tags["name:en"] ?? element.tags["name"];
            if (
                response.features.find(
                    (feature: any) => feature.properties.name === name,
                )
            )
                return;
            response.features.push(
                turf.point([element.lon, element.lat], { name }),
            );
        }
        if (!element.center || !element.center.lon || !element.center.lat)
            return;
        const name = element.tags["name:en"] ?? element.tags["name"];
        if (
            response.features.find(
                (feature: any) => feature.properties.name === name,
            )
        )
            return;
        response.features.push(
            turf.point([element.center.lon, element.center.lat], { name }),
        );
    });
    return response;
};

export const findAdminBoundary = async (
    latitude: number,
    longitude: number,
    adminLevel: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
) => {
    // If the requested adminLevel corresponds to electoral divisions (5), prefer
    // the bundled geojson file if available rather than hitting Overpass every time.
    if (adminLevel === 5) {
        try {
                const resp = await cacheFetch(ELECTORAL_BOUNDARY_GEOJSON,
                "Loading electoral boundary data...",
                CacheType.PERMANENT_CACHE,
            );
            const data = await resp.json();
            const point = turf.point([longitude, latitude]);
            for (const feature of data.features) {
                if (
                    feature.geometry &&
                    (feature.geometry.type === "Polygon" ||
                        feature.geometry.type === "MultiPolygon")
                ) {
                    try {
                        if (turf.booleanPointInPolygon(point, feature as any)) {
                            return feature as any;
                        }
                    } catch (e) {
                        // continue on errors in polygon checks
                    }
                }
            }
        } catch (err) {
            // If local lookup fails for any reason, fallback to Overpass below
            console.warn("Failed to load electoral boundaries locally, falling back to Overpass", err);
        }
    }
};

export const findAdminBoundariesByLetter = async (
    adminLevel: number,
    letter: string,
) => {
    try {
        const resp = await cacheFetch(ELECTORAL_BOUNDARY_GEOJSON,
            "Loading electoral boundary data...",
            CacheType.PERMANENT_CACHE,
        );
        const data = await resp.json();
        const upperLetter = letter.toUpperCase();
        const features = data.features.filter((feature: any) => {
            const name =
                feature.properties?.["name:en"] || feature.properties?.Name || feature.properties?.name;
            if (!name || typeof name !== "string") return false;
            return name[0].toUpperCase() === upperLetter;
        });
        return {
            type: "FeatureCollection",
            features,
        } as any;
    } catch (err) {
        console.warn("Failed to load electoral boundaries locally for letter filter, falling back to Overpass", err);
    }
    return geo;
};

export const fetchCoastline = async () => {
    const response = await cacheFetch("/singapore.geojson",
        "Fetching coastline data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data;
};


export const fetchLibraries = async () => {
    const response = await cacheFetch("/Libraries.geojson",
        "Fetching library data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data as FeatureCollection;
};

export const fetchMuseums = async () => {
    const response = await cacheFetch("/Museums.geojson",
        "Fetching museum data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data as FeatureCollection;
};

export const fetchHawkerCenters = async () => {
    const response = await cacheFetch("/Hawker.geojson",
        "Fetching hawker center data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data as FeatureCollection;
}

export const fetchSupermarkets = async () => {
    const response = await cacheFetch("/Supermarkets.geojson",
        "Fetching supermarket data...",
        CacheType.PERMANENT_CACHE,
    );
    const data = await response.json();
    return data as FeatureCollection;
}

export const trainLineNodeFinder = async (node: string): Promise<number[]> => {
    const nodeId = node.split("/")[1];
    const tagQuery = `
[out:json];
node(${nodeId});
wr(bn);
out tags;
`;
    const tagData = await getOverpassData(tagQuery, "Finding train line...");
    // Try to use the static sgmrt data first to derive line names; then build a smaller overpass query when necessary.
    const tagElements = tagData.elements || [];
    let possibleLineQueries: string[] = [];

    // Use station name to query sgmrt lines
    const nodeName =
        (tagElements[0] && (tagElements[0].tags["name:en"] || tagElements[0].tags.name)) ||
        undefined;
    if (nodeName) {
        const sgmrtLines = await getLineNamesForStationName(nodeName);
        if (sgmrtLines && sgmrtLines.length) {
            for (const ln of sgmrtLines) {
                possibleLineQueries.push(`wr["name"="${ln}"];`);
            }
        }
    }

    // Fallback to using tag-based network or names
    for (const element of tagElements) {
        if (element.tags && (element.tags.name || element.tags["name:en"])) {
            const nm = element.tags["name:en"] || element.tags.name;
            if (nm) {
                possibleLineQueries.push(`wr["name"="${nm}"];`);
            }
        }
        if (element.tags && element.tags.network) {
            possibleLineQueries.push(`wr["network"="${element.tags.network}"];`);
        }
    }

    const query = `
[out:json];
(
${possibleLineQueries.join("\n")}
);
out geom;
`;
    const data = await getOverpassData(query, "Finding train lines...");
    const geoJSON = osmtogeojson(data);
    const nodes: number[] = [];
    geoJSON.features.forEach((feature: any) => {
        if (feature && feature.id && feature.id.startsWith("node")) {
            nodes.push(parseInt(feature.id.split("/")[1]));
        }
    });
    data.elements.forEach((element: any) => {
        if (element && element.type === "node") {
            nodes.push(element.id);
        } else if (element && element.type === "way") {
            nodes.push(...element.nodes);
        }
    });
    const uniqNodes = _.uniq(nodes);
    return uniqNodes;
};

const geojsontoosm = (geojson: FeatureCollection) => {
    return {
        elements: geojson.features.map((feature) => ({
            type: "node",
            id: feature.properties?.osm_id || 0,
            lat: feature.geometry.type === "Point" ? feature.geometry.coordinates[1] : undefined,
            lon: feature.geometry.type === "Point" ? feature.geometry.coordinates[0] : undefined,
            tags: {
                name: feature.properties?.name || "",
            },
        }))
    }
}

export const findPlacesInZone = async (
    filter: string,
    loadingText?: string,
    searchType:
        | "node"
        | "way"
        | "relation"
        | "nwr"
        | "nw"
        | "wr"
        | "nr"
        | "area" = "nwr",
    outType: "center" | "geom" = "center",
    alternatives: string[] = [],
    timeoutDuration: number = 0,
    returnGeoJSON: boolean = false,
) => {

    let data = null;
    if(loadingText?.includes("libraries")){
        data = await fetchLibraries();
    }
    if(loadingText?.includes("museums")){
        data = await fetchMuseums();
    }
    console.log({loadingText})
    if(loadingText?.includes("hawker")){
        data = await fetchHawkerCenters();
    }
    if(loadingText?.includes("airports")){
        data = Object.assign({}, airports);
    }
    if(loadingText?.includes("international borders")){
        data = Object.assign({}, international_borders);
    }
    if(loadingText?.includes("mountains")){
        data = Object.assign({}, mountains);
    }

    if(loadingText?.includes("supermarkets")){
        data = await fetchSupermarkets();
    }

    if(returnGeoJSON && data !== null){
        return data;
    }

    if(data == null) {
        return [];
    }

    data = geojsontoosm(data);


    const subtractedEntries = additionalMapGeoLocations
        .get()
        .filter((e) => !e.added);
    const subtractedPolygons = subtractedEntries.map((entry) => entry.location);
    if (subtractedPolygons.length > 0 && data && data.elements) {
        const turfPolys = await Promise.all(
            subtractedPolygons.map(
                async (location) =>
                    turf.combine(
                        await determineGeoJSON(
                            location.properties.osm_id.toString(),
                            location.properties.osm_type,
                        ),
                    ).features[0],
            ),
        );
        data.elements = data.elements.filter((el: any) => {
            const lon = el.center ? el.center.lon : el.lon;
            const lat = el.center ? el.center.lat : el.lat;
            if (typeof lon !== "number" || typeof lat !== "number")
                return false;
            const pt = turf.point([lon, lat]);
            return !turfPolys.some((poly) =>
                turf.booleanPointInPolygon(pt, poly as any),
            );
        });
    }
    return data;
};

export const findPlacesSpecificInZone = async (
    location: `${QuestionSpecificLocation}`,
) => {
    const locations = (
        await findPlacesInZone(
            location,
            `Finding ${
                location === '["brand:wikidata"="Q38076"]'
                    ? "McDonald's"
                    : "7-Elevens"
            }...`,
        )
    ).elements;
    return turf.featureCollection(
        locations.map((x: any) =>
            turf.point([
                x.center ? x.center.lon : x.lon,
                x.center ? x.center.lat : x.lat,
            ]),
        ),
    );
};

export const nearestToQuestion = async (
    question: HomeGameMatchingQuestions | HomeGameMeasuringQuestions,
) => {
    let radius = 5;
    let instances: any = { features: [] };
    while (instances.features.length === 0) {
        instances = await findTentacleLocations(
            {
                lat: question.lat,
                lng: question.lng,
                radius: radius,
                unit: "kilometers",
                location: false,
                locationType: question.type,
                drag: false,
                color: "black",
                collapsed: false,
            },
            "Finding matching locations...",
        );
        radius += 5;
        if(radius > 500){
            break;
        }
    }
    const questionPoint = turf.point([question.lng, question.lat]);
    return turf.nearestPoint(questionPoint, instances as any);
};

export const determineMapBoundaries = async () => {
    const mapGeoDatum = await Promise.all(
        [
            {
                location: mapGeoLocation.get(),
                added: true,
                base: true,
            },
            ...additionalMapGeoLocations.get(),
        ].map(async (location) => ({
            added: location.added,
            data: await determineGeoJSON(
                location.location.properties.osm_id.toString(),
                location.location.properties.osm_type,
            ),
        })),
    );

    let mapGeoData = turf.featureCollection([
        safeUnion(
            turf.featureCollection(
                mapGeoDatum
                    .filter((x) => x.added)
                    .flatMap((x) => x.data.features),
            ) as any,
        ),
    ]);

    const differences = mapGeoDatum.filter((x) => !x.added).map((x) => x.data);

    if (differences.length > 0) {
        mapGeoData = turf.featureCollection([
            turf.difference(
                turf.featureCollection([
                    mapGeoData.features[0],
                    ...differences.flatMap((x) => x.features),
                ]),
            )!,
        ]);
    }

    if (turf.coordAll(mapGeoData).length > 10000) {
        turf.simplify(mapGeoData, {
            tolerance: 0.0005,
            highQuality: true,
            mutate: true,
        });
    }

    return turf.combine(mapGeoData) as FeatureCollection<MultiPolygon>;
};
