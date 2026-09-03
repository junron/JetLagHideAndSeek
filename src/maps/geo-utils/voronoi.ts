import * as turf from "@turf/turf";
import { geoMercator } from "d3-geo";
// @ts-expect-error No type declaration
import { geoProject, geoStitch } from "d3-geo-projection";
// @ts-expect-error No type declaration
import { geoVoronoi } from "d3-geo-voronoi";
import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

const scaleReference = turf.toMercator(turf.point([180, 90])); // I thought this would yield the same as turf.earthRadius * Math.pi, but it's slightly larger

export const geoSpatialVoronoi = (
    points: FeatureCollection<Point>,
): FeatureCollection<Polygon | MultiPolygon> => {
    const voronoi = geoVoronoi()(points).polygons();
    const ratio = scaleReference.geometry.coordinates[0] / 480.5; // 961 is the default scale for some reason
    const ONE_METER_IN_PROJECTED_UNITS = 1 / ratio;
    const projected = geoProject(
        geoStitch(voronoi),
        geoMercator()
            .translate([0, 0])
            .precision(ONE_METER_IN_PROJECTED_UNITS),
    );

    turf.coordEach(projected, (coord) => {
        coord[0] = coord[0] * ratio;
        coord[1] = coord[1] * -ratio; // y-coordinates are flipped
    });

    return turf.toWgs84(projected);
};
