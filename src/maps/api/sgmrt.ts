import * as turf from "@turf/turf";
import type { FeatureCollection, Feature } from "geojson";
// Note: No Node 'path' or 'url' modules; this module runs in browser context

let cached: {
    geojson: FeatureCollection | null;
    stationsByName: Map<string, Feature>;
    stationsByCode: Map<string, Feature>;
    lines: Feature[];
    stationToLines: Map<string, Set<string>>;
} | null = null;

function normalizeName(n?: string) {
    if (!n) return "";
    return n
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[\.\-'/]/g, "")
        .trim();
}

export async function loadSgmrt() {
    if (cached) return cached;

    // We'll fetch the file from the public folder using the base url
    const url = "/sgmrt.geojson";
    const resp = await fetch(url);
    const geojson = (await resp.json()) as FeatureCollection;

    const stationsByName = new Map();
    const stationsByCode = new Map();
    const lines: Feature[] = [];
    const stationToLines = new Map();

    const stationFeatures = (geojson.features || []).filter(
        (f: any) => f.properties && f.properties.stop_type === "station",
    );

    stationFeatures.forEach((s: any) => {
        const name = s.properties["name:en"] || s.properties.name;
        const nname = normalizeName(name);
        if (nname) stationsByName.set(nname, s);

        if (s.properties.station_codes) {
            const codes = s.properties.station_codes.split("-").filter(Boolean);
            for (const code of codes) {
                stationsByCode.set(code, s);
            }
        }

        stationToLines.set(nname, new Set());
    });

    const lineFeatures = (geojson.features || []).filter(
        (f: any) => f.geometry && f.geometry.type === "LineString",
    );

    // Build lines array and map stations to lines by nearest coordinate matching
    for (const line of lineFeatures as any) {
        const lineName = line.properties?.name || line.properties?.network || "";
        lines.push(line);

        // Each coordinate on the line: find nearest station if within tolerance
        const coords: number[][] = line.geometry.coordinates || [];
        const linePts = turf.featureCollection(coords.map((c) => turf.point(c)));

        for (const s of stationFeatures as any[]) {
            const sp = turf.point(s.geometry.coordinates as any);
            // find nearest point from coords
            let found = false;
            for (let i = 0; i < coords.length; i++) {
                const d = turf.distance(sp, turf.point(coords[i]), { units: "kilometers" });
                // tolerance ~ 0.5 km (500 m) — increase if needed
                if (d <= 0.5) {
                    const nname = normalizeName(s.properties["name:en"] || s.properties.name);
                    if (!stationToLines.has(nname)) {
                        stationToLines.set(nname, new Set());
                    }
                    stationToLines.get(nname)!.add(lineName);
                    found = true;
                    break;
                }
            }
            // if not found, maybe by code association to reduce false negatives
            if (!found && s.properties.station_codes) {
                const codes = s.properties.station_codes.split("-").filter(Boolean);
                for (const code of codes) {
                    // Some lines correlate to code prefix
                    // We'll assume this line contains the code if code prefix matches the line name token
                    // This is heuristic; better to match geolocation above.
                    if (lineName && lineName.toLowerCase().includes(code.slice(0, 2).toLowerCase())) {
                        const nname = normalizeName(s.properties["name:en"] || s.properties.name);
                        stationToLines.get(nname)!.add(lineName);
                        break;
                    }
                }
            }
        }
    }

    cached = {
        geojson,
        stationsByName,
        stationsByCode,
        lines,
        stationToLines,
    };

    return cached;
}

export async function getLineNamesForStationName(name?: string) {
    if (!name) return [];
    const data = await loadSgmrt();
    const nname = normalizeName(name);
    const set = data.stationToLines.get(nname);
    if (!set) {
        return [];
    }
    return [...set];
}

export async function areStationsOnSameLineByNames(a?: string, b?: string) {
    if (!a || !b) return false;
    const data = await loadSgmrt();
    const na = normalizeName(a);
    const nb = normalizeName(b);
    const sa = data.stationToLines.get(na);
    const sb = data.stationToLines.get(nb);
    if (!sa || !sb) return false;
    for (const l of sa) {
        if (sb.has(l)) return true;
    }
    return false;
}

export async function findStationByName(name?: string) {
    if (!name) return null;
    const data = await loadSgmrt();
    const s = data.stationsByName.get(normalizeName(name));
    return s || null;
}
