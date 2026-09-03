export const PHOTO_SUBJECT_IDS = [
    "any_building_visible_from_transit_station",
    "widest_street",
    "tree",
    "tallest_structure_in_sightline",
    "you",
    "sky",
    "tallest_building_visible_from_transit_station",
    "trace_nearest_street_or_path",
    "two_buildings",
    "restaurant_interior",
    "park",
    "grocery_store_aisle",
    "place_of_worship",
    "train_platform",
] as const;

export type PhotoSubject = (typeof PHOTO_SUBJECT_IDS)[number];

export const PHOTO_QUESTIONS: ReadonlyArray<{
    id: PhotoSubject;
    label: string;
    instructions: string;
    mediumOnly: boolean;
}> = [
    {
        id: "any_building_visible_from_transit_station",
        label: "Any Building Visible from Transit Station",
        instructions:
            "Stand directly outside a station entrance. Include the roof and both sides, with the top of the building in the top third of the frame.",
        mediumOnly: false,
    },
    {
        id: "widest_street",
        label: "Widest Street",
        instructions: "Include both sides of the street.",
        mediumOnly: false,
    },
    {
        id: "tree",
        label: "Tree",
        instructions: "Include the entire tree.",
        mediumOnly: false,
    },
    {
        id: "tallest_structure_in_sightline",
        label: "Tallest Structure in Your Current Sightline",
        instructions:
            "Use the tallest structure from your perspective. Include the top and both sides.",
        mediumOnly: false,
    },
    {
        id: "you",
        label: "You",
        instructions:
            "Use selfie mode with the phone perpendicular to the ground, arm fully extended, default lens, and no zoom.",
        mediumOnly: false,
    },
    {
        id: "sky",
        label: "The Sky",
        instructions:
            "Place the phone on the ground and shoot directly up using the default lens with no zoom.",
        mediumOnly: false,
    },
    {
        id: "tallest_building_visible_from_transit_station",
        label: "Tallest Building Visible from Transit Station",
        instructions:
            "Stand directly outside a station entrance and photograph the tallest building from your perspective.",
        mediumOnly: true,
    },
    {
        id: "trace_nearest_street_or_path",
        label: "Trace Nearest Street/Path",
        instructions:
            "The street or path must be visible on the mapping app; trace it from intersection to intersection.",
        mediumOnly: true,
    },
    {
        id: "two_buildings",
        label: "2 Buildings",
        instructions: "Include the bottom and up to four stories.",
        mediumOnly: true,
    },
    {
        id: "restaurant_interior",
        label: "Restaurant Interior",
        instructions:
            "No zoom. Take the picture through the window from outside the restaurant.",
        mediumOnly: true,
    },
    {
        id: "park",
        label: "Park",
        instructions:
            "No zoom; hold the phone perpendicular to the ground and stand clear of obstructions.",
        mediumOnly: true,
    },
    {
        id: "grocery_store_aisle",
        label: "Grocery Store Aisle",
        instructions:
            "No zoom. Stand at the end of the aisle and shoot directly down it.",
        mediumOnly: true,
    },
    {
        id: "place_of_worship",
        label: "Place of Worship",
        instructions:
            "Include a distinctive section with at least three identifiable elements.",
        mediumOnly: true,
    },
    {
        id: "train_platform",
        label: "Train Platform",
        instructions:
            "Include a distinctive section with at least three identifiable elements.",
        mediumOnly: true,
    },
];

export function photoQuestionDetails(subject: PhotoSubject) {
    return PHOTO_QUESTIONS.find((question) => question.id === subject)!;
}
