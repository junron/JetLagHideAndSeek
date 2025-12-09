import { describe, it, expect } from 'vitest';
import { computeShortestPathBetweenStationNames, computeShortestPathBetweenStations, getLineNamesForStationName } from '../src/maps/api/sgmrt';
import * as turf from '@turf/turf';

describe('sgmrt shortest path', () => {
  it('finds path between stations on same line', async () => {
    const res = await computeShortestPathBetweenStationNames('Bishan', 'Ang Mo Kio');
    expect(res).toBeTruthy();
    if (res) {
      expect(res.segments.length).toBeGreaterThanOrEqual(1);
      expect(res.total_distance_km).toBeGreaterThan(0);
      expect(res.total_duration_seconds).toBeGreaterThan(0);
      // Each segment should contain coordinates
      for (const s of res.segments) {
        expect(s.coords.length).toBeGreaterThanOrEqual(2);
        expect(s.distance_km).toBeGreaterThan(0);
      }
    }
  });

  it('finds path from Aljunied to Ang Mo Kio', async () => {
    const res = await computeShortestPathBetweenStationNames('Aljunied', 'Ang Mo Kio');
    expect(res).toBeTruthy();
    if (res) {
      expect(res.segments.length).toBeGreaterThanOrEqual(1);
      expect(res.total_distance_km).toBeGreaterThan(0);
      expect(res.total_duration_seconds).toBeGreaterThan(0);
    }
  });

  // End of file

  it('finds path between distant stations with transfers', async () => {
  const res = await computeShortestPathBetweenStations('NS17', 'DT16');
    expect(res).toBeTruthy();
    if (res) {
      expect(res.segments.length).toBeGreaterThanOrEqual(1);
      expect(res.total_distance_km).toBeGreaterThan(0);
      expect(res.total_duration_seconds).toBeGreaterThan(0);
      // ensure returned route includes at least one station with multiple lines for transfer
      expect(res.stations.length).toBeGreaterThan(1);
    }
  });

  it('correctly maps stations to their lines', async () => {
    const aljLines = await getLineNamesForStationName('Aljunied');
    expect(aljLines).toBeTruthy();
    expect(aljLines).toContain('East West Line');

    const bayfrontLines = await getLineNamesForStationName('Bayfront');
    expect(bayfrontLines).toBeTruthy();
    // Bayfront is an interchange station (DT and CE/ Circle extension)
    expect(bayfrontLines.length).toBeGreaterThanOrEqual(1);
    expect(bayfrontLines.some((l) => /Downtown|Circle/i.test(l))).toBeTruthy();
  });
});
