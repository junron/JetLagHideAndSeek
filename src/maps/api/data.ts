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
            geometry: {
                type: "Point",
                coordinates: [103.76917898654938, 1.452598503901771],
            },
        },
        {
            type: "Feature",
            properties: { name: "Second Link" },
            geometry: {
                type: "Point",
                coordinates: [103.63447576761249, 1.3497370633490116],
            },
        },
    ],
};

export const mountains: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { name: "Bukit Timah" },
            geometry: { type: "Point", coordinates: [103.7750291, 1.3572969] },
        },
        {
            type: "Feature",
            properties: { name: "Mount Faber" },
            geometry: { type: "Point", coordinates: [103.8190964, 1.2718601] },
        },
        {
            type: "Feature",
            properties: { name: "Fort Canning Hill" },
            geometry: { type: "Point", coordinates: [103.846944, 1.294444] },
        },
        {
            type: "Feature",
            properties: { name: "Telok Blangah Hill" },
            geometry: { type: "Point", coordinates: [103.81055, 1.27887] },
        },
        {
            type: "Feature",
            properties: { name: "Jurong Hill" },
            geometry: { type: "Point", coordinates: [103.70725, 1.31745] },
        },
    ],
};

// Source: https://www.mlaw.gov.sg/files/Annex__List_of_Golf_Courses_in_Singapore__7_July_2025_.pdf
export const golf_courses: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { name: "Warren Golf & Country Club" },
            geometry: { type: "Point", coordinates: [103.7397168, 1.3859699] },
        },
        {
            type: "Feature",
            properties: { name: "Singapore Island Country Club (Bukit)" },
            geometry: { type: "Point", coordinates: [103.8088331, 1.3415154] },
        },
        {
            type: "Feature",
            properties: { name: "Singapore Island Country Club (Island)" },
            geometry: { type: "Point", coordinates: [103.8179817, 1.3595685] },
        },
        {
            type: "Feature",
            properties: { name: "Tanah Merah Country Club (Garden)" },
            geometry: { type: "Point", coordinates: [103.9774168, 1.3299545] },
        },
        {
            type: "Feature",
            properties: { name: "Tanah Merah Country Club (Tampines)" },
            geometry: { type: "Point", coordinates: [103.968964, 1.3297832] },
        },
        {
            type: "Feature",
            properties: { name: "Changi Golf Club" },
            geometry: { type: "Point", coordinates: [103.9818554, 1.3894165] },
        },
        {
            type: "Feature",
            properties: { name: "Laguna National Golf Resort Club" },
            geometry: { type: "Point", coordinates: [103.9607357, 1.3239211] },
        },

        {
            type: "Feature",
            properties: {
                name: "National Service Resort & Country Club (Changi)",
            },
            geometry: { type: "Point", coordinates: [103.9719781, 1.3185099] },
        },
        {
            type: "Feature",
            properties: {
                name: "National Service Resort & Country Club (Kranji)",
            },
            geometry: { type: "Point", coordinates: [103.7260087, 1.4245543] },
        },

        {
            type: "Feature",
            properties: { name: "Orchid Country Club" },
            geometry: { type: "Point", coordinates: [103.8435728, 1.4124561] },
        },

        {
            type: "Feature",
            properties: { name: "Seletar Country Club" },
            geometry: { type: "Point", coordinates: [103.8555412, 1.4096707] },
        },

        {
            type: "Feature",
            properties: { name: "Sembawang Country Club" },
            geometry: { type: "Point", coordinates: [103.8137774, 1.4170968] },
        },
        {
            type: "Feature",
            properties: { name: "Mandai Executive Golf Course" },
            geometry: { type: "Point", coordinates: [103.8083732, 1.4007913] },
        },

        {
            type: "Feature",
            properties: { name: "Keppel Club (Sime)" },
            geometry: { type: "Point", coordinates: [103.8108305, 1.3422204] },
        },
        {
            type: "Feature",
            properties: { name: "Sentosa Golf Club (Serapong)" },
            geometry: { type: "Point", coordinates: [103.8301809, 1.2496344] },
        },
        {
            type: "Feature",
            properties: { name: "Sentosa Golf Club (Tanjong)" },
            // 1.24383,103.8266716
            geometry: { type: "Point", coordinates: [103.8266716, 1.24383] },
        },
    ],
};

export const universities: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { name: "National University of Singapore" },
            geometry: { type: "Point", coordinates: [103.7741167, 1.2976547] },
        },
        {
            type: "Feature",
            properties: { name: "Nanyang Technological University" },
            geometry: { type: "Point", coordinates: [103.6805598, 1.3483153] },
        },
        {
            type: "Feature",
            properties: { name: "Singapore Management University" },
            geometry: { type: "Point", coordinates: [103.849157, 1.2965224] },
        },
        {
            type: "Feature",
            properties: {
                name: "Singapore University of Technology and Design",
            },
            geometry: { type: "Point", coordinates: [103.9610006, 1.3410544] },
        },
        {
            type: "Feature",
            properties: { name: "Singapore Institute of Technology" },
            // 1.4136358,103.9073802
            geometry: { type: "Point", coordinates: [103.9073802, 1.4136358] },
        },
        {
            type: "Feature",
            properties: { name: "Singapore University of Social Sciences" },
            geometry: { type: "Point", coordinates: [103.7736218, 1.3290864] },
        },
        {
            type: "Feature",
            properties: { name: "University of the Arts Singapore" },
            geometry: { type: "Point", coordinates: [103.8507886, 1.2986745] },
        },
    ],
};

export const reservoirs: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: {
                name: "Bedok Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.9265, 1.3425],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Changi Creek Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.993, 1.3892],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Jurong Lake",
            },
            geometry: {
                type: "Point",
                coordinates: [103.7283, 1.3356],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Kranji Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.7322, 1.4150],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Lower Peirce Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.8195, 1.3716],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Lower Seletar Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.8485, 1.4083],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "MacRitchie Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.8239, 1.3448],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Marina Reservoir",
            },
            geometry: {
                type: "Point",
                // 1.2876474,103.8604691
                coordinates: [103.8604691, 1.2876474],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Murai Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.6775, 1.4008],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Pandan Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.7426, 1.3117],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Poyan Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.6716, 1.3704],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Pulau Tekong Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [104.0448, 1.4169],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Punggol Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.8865, 1.4001],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Sarimbun Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.6803, 1.4249],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Serangoon Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.9173, 1.3914],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Tengeh Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.6506, 1.3462],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Upper Peirce Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.7968, 1.3676],
            },
        },
        {
            type: "Feature",
            properties: {
                name: "Upper Seletar Reservoir",
            },
            geometry: {
                type: "Point",
                coordinates: [103.7927, 1.3991],
            },
        },
    ],
};
