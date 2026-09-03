const TURF_EARTH_RADIUS_METERS = 6_371_008.8;
const METERS_PER_DEGREE = (2 * Math.PI * TURF_EARTH_RADIUS_METERS) / 360;

/**
 * A conservative angular equivalent of one meter for GeoJSON coordinates.
 * Longitude degrees cover no more distance than this at any latitude.
 */
export const ONE_METER_IN_DEGREES = 1 / METERS_PER_DEGREE;
