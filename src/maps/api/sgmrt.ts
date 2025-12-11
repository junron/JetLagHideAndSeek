import * as turf from "@turf/turf";
import type { Feature,FeatureCollection } from "geojson";
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

    // We'll fetch the file from the public folder using the base url.
    // In Node (tests), `fetch('/sgmrt.geojson')` isn't a valid absolute URL, so
    // read directly from the repository public folder instead.
    let geojson: FeatureCollection;
    if (typeof window === "undefined") {
        // Node environment - resolve path relative to this file; dynamically import fs to avoid bundler errors in browser
        const { readFile } = await import('fs/promises');
        const p = new URL("../../../public/sgmrt.geojson", import.meta.url);
        const txt = await readFile(p, { encoding: "utf8" });
        geojson = JSON.parse(txt) as FeatureCollection;
    } else {
        const url = "/sgmrt.geojson";
        const resp = await fetch(url);
        geojson = (await resp.json()) as FeatureCollection;
    }

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
        (f: any) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"),
    );

    // Build lines array and map stations to lines by nearest coordinate matching
    for (const line of lineFeatures as any) {
        const lineName = line.properties?.name || line.properties?.network || "";
            // Each line: find nearest station if within tolerance using continuous line distance
        const coords: number[][] = line.geometry.type === 'MultiLineString' ? (line.geometry.coordinates as number[][][]).flat() : (line.geometry.coordinates as number[][]);
        // copy with flattened coords so downstream logic works consistently
        const storedLine = { ...line, geometry: { ...line.geometry, coordinates: coords } } as any;
        lines.push(storedLine);

        for (const s of stationFeatures as any[]) {
            const sp = turf.point(s.geometry.coordinates as any);
            const lineFeature = turf.lineString(coords);
            const d = turf.pointToLineDistance(sp, lineFeature, { units: "kilometers" });
            let found = false;
            // tolerance ~ 0.5 km (500 m) — increase if needed
            if (d <= 0.5) {
                const nname = normalizeName(s.properties["name:en"] || s.properties.name);
                if (!stationToLines.has(nname)) {
                    stationToLines.set(nname, new Set());
                }
                stationToLines.get(nname)!.add(lineName);
                found = true;
            }
            // fallback: if not found, use station_codes -> map code prefix to line via known abbreviations
            if (!found && s.properties.station_codes) {
                const codeToRegex: Record<string, RegExp> = {
                    NS: /(north.*south|north[-\s]?south)/i,
                    EW: /(east.*west|east[-\s]?west)/i,
                    CC: /\bcircle\b/i,
                    DT: /\bdowntown\b/i,
                    NE: /(north.*east|northeast)/i,
                    TE: /(thomson.*east.*coast|thomson[-\s]?east.*coast|thomson)/i,
                    CR: /(cross.*island|cross[-\s]?island)/i,
                    CE: /circle|extension|ce/i,
                };
                const codes = s.properties.station_codes.split("-").filter(Boolean);
                for (const code of codes) {
                    const prefix = code.replace(/[0-9]/g, "").toUpperCase();
                    const matcher = codeToRegex[prefix as keyof typeof codeToRegex];
                    if (!matcher) continue;
                    if (matcher.test(lineName || "")) {
                        const nname = normalizeName(s.properties["name:en"] || s.properties.name);
                        if (!stationToLines.has(nname)) {
                            stationToLines.set(nname, new Set());
                        }
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

export async function findNearestStationByCoords(coords: number[]) {
    const data = await loadSgmrt();
    if (!data.geojson) return null;
    const stations = (data.geojson.features || []).filter((f: any) => f.properties && f.properties.stop_type === "station");
    if (!stations.length) return null;
    const p = turf.point(coords);
    let nearest = stations[0];
    let best = Infinity;
    for (const s of stations) {
        const sp = turf.point((s.geometry as any).coordinates as any);
        const d = turf.distance(p, sp, { units: "kilometers" });
        if (d < best) {
            best = d;
            nearest = s;
        }
    }
    return nearest;
}

export async function findStationByCode(code?: string) {
    if (!code) return null;
    const data = await loadSgmrt();
    const s = data.stationsByCode.get(code);
    return s || null;
}


// Generic wrapper: accepts either station names or codes
export async function computeShortestPathBetweenStations(
    from: string,
    to: string,
): Promise<ShortestPathResult | null> {
    const data = await loadSgmrt();
    // Resolve code or name
    const fromFeat = data.stationsByCode.get(from) || data.stationsByName.get(normalizeName(from));
    const toFeat = data.stationsByCode.get(to) || data.stationsByName.get(normalizeName(to));
    if (!fromFeat || !toFeat) return null;
    const fromName = normalizeName((fromFeat.properties && (fromFeat.properties['name:en'] || fromFeat.properties.name)) as any);
    const toName = normalizeName((toFeat.properties && (toFeat.properties['name:en'] || toFeat.properties.name)) as any);
    console.log({fromName, toName});
    return computeShortestPathBetweenStationNames(fromName, toName);
}

export type ShortestPathSegment = {
    from: string; // normalized name
    to: string; // normalized name
    line: string; // line name
    distance_km: number;
    duration_seconds: number;
    coords: number[][]; // coordinates along the line between the two stations inclusive
};

export type ShortestPathResult = {
    segments: ShortestPathSegment[];
    total_distance_km: number;
    total_duration_seconds: number;
    stations: { name: string; coords: number[] }[];
};

// Compute the shortest path between two station names, using train travel at 30km/h and
// assuming instant transfers. Returns path segments with coordinates for map animation.
export async function computeShortestPathBetweenStationNames(
    fromName: string,
    toName: string,
): Promise<ShortestPathResult | null> {
    if (!fromName || !toName) return null;
    const data = await loadSgmrt();
    const startName = normalizeName(fromName);
    const endName = normalizeName(toName);

    if (!data.stationToLines.has(startName) || !data.stationToLines.has(endName)) {
        return null;
    }

    // Build mapping of stations to their coordinate and to index positions on each line
    type LineStationMatch = { stationName: string; coordIndex: number };
    const lineStationsByLine = new Map<string, LineStationMatch[]>();

    for (const line of data.lines as any[]) {
        const lineName = line.properties?.name || line.properties?.network || "";
        const coords: number[][] = line.geometry.coordinates || [];
        const matches: LineStationMatch[] = [];
        // Find nearest stations along the line coords
        coords.forEach((c, idx) => {
            // For each coordinate, test nearby stations
            for (const [sname, feature] of data.stationsByName.entries()) {
                const sp = turf.point((feature.geometry as any).coordinates as any);
                const d = turf.distance(sp, turf.point(c), { units: "kilometers" });
                if (d <= 0.5) {
                    // add match if not already present for this station
                    if (!matches.some((m) => m.stationName === sname)) {
                        matches.push({ stationName: sname, coordIndex: idx });
                    }
                }
            }
        });

        // Sort matches by index along the line
        matches.sort((a, b) => a.coordIndex - b.coordIndex);
        if (matches.length > 0) {
            lineStationsByLine.set(lineName, matches);
        }
    }

    // Build adjacency graph: stationName -> edges
    const adj = new Map<string, Array<{ to: string; line: string; distance_km: number; duration_seconds: number; coords: number[][] }>>();

    const trainSpeedKmph = 30;

    function addEdge(a: string, b: string, lineName: string, coordsSlice: number[][]) {
        // compute distance by summing along coordsSlice
        let distance_km = 0;
        for (let i = 1; i < coordsSlice.length; i++) {
            distance_km += turf.distance(turf.point(coordsSlice[i - 1]), turf.point(coordsSlice[i]), { units: "kilometers" });
        }
        const duration_seconds = (distance_km / trainSpeedKmph) * 3600; // seconds
        if (!adj.has(a)) adj.set(a, []);
        adj.get(a)!.push({ to: b, line: lineName, distance_km, duration_seconds, coords: coordsSlice });
    }

    // For each line, connect consecutive matched stations
    for (const line of data.lines as any[]) {
        const lineName = line.properties?.name || line.properties?.network || "";
        const coords: number[][] = line.geometry.coordinates || [];
        const matches = lineStationsByLine.get(lineName);
        if (!matches || matches.length < 2) continue;
        for (let i = 0; i < matches.length - 1; i++) {
            const a = matches[i];
            const b = matches[i + 1];
            const startIdx = a.coordIndex;
            const endIdx = b.coordIndex;
            const slice = startIdx <= endIdx ? coords.slice(startIdx, endIdx + 1) : coords.slice(endIdx, startIdx + 1).reverse();
            addEdge(a.stationName, b.stationName, lineName, slice);
            addEdge(b.stationName, a.stationName, lineName, slice.slice().reverse());
        }
    }

    // Dijkstra: min duration (seconds)
    type QueueItem = { name: string; duration_seconds: number };
    const durations = new Map<string, number>();
    const prev = new Map<string, { prev: string | null; line?: string; edge?: any }>();

    const stations = Array.from(data.stationsByName.keys());
    for (const s of stations) durations.set(s, Number.POSITIVE_INFINITY);
    durations.set(startName, 0);

    const queue: QueueItem[] = [{ name: startName, duration_seconds: 0 }];

    while (queue.length > 0) {
        // pop smallest
        queue.sort((a, b) => a.duration_seconds - b.duration_seconds);
        const item = queue.shift()!;
        const curName = item.name;
        const curDur = item.duration_seconds;
        if (curDur !== durations.get(curName)) continue; // stale
        if (curName === endName) break;
        const neighbors = adj.get(curName) || [];
        for (const edge of neighbors) {
            const nd = curDur + edge.duration_seconds;
            const old = durations.get(edge.to) ?? Number.POSITIVE_INFINITY;
            if (nd < old) {
                durations.set(edge.to, nd);
                prev.set(edge.to, { prev: curName, line: edge.line, edge });
                queue.push({ name: edge.to, duration_seconds: nd });
            }
        }
    }

    if (!prev.has(endName)) {
        return null; // no path
    }

    // Build path by backtracking
    const segments: ShortestPathSegment[] = [];
    const stationPath: { name: string; coords: number[] }[] = [];
    let cur = endName;
    while (cur !== startName) {
        const p = prev.get(cur)!;
        const from = p.prev!;
        const edge = p.edge;
        segments.push({ from, to: cur, line: edge.line, distance_km: edge.distance_km, duration_seconds: edge.duration_seconds, coords: edge.coords });
        const feat = data.stationsByName.get(cur)!;
        stationPath.push({ name: cur, coords: (feat.geometry as any).coordinates as any });
        cur = from;
    }
    const startFeat = data.stationsByName.get(startName)!;
    stationPath.push({ name: startName, coords: (startFeat.geometry as any).coordinates as any });
    // segments were built from end to start; reverse
    segments.reverse();
    stationPath.reverse();

    const total_distance_km = segments.reduce((s, seg) => s + seg.distance_km, 0);
    const total_duration_seconds = segments.reduce((s, seg) => s + seg.duration_seconds, 0);

    return {
        segments,
        total_distance_km,
        total_duration_seconds,
        stations: stationPath,
    };
}


// debug console removed - avoid running logic at module import time