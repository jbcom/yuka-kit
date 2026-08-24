import { describe, expect, it } from 'vitest';
import { generateFormation } from './formations.js';

const origin = { x: 0, y: 0, z: 0 };

describe('generateFormation', () => {
    it('arranges a ring pattern around the origin at the configured radius', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 6, radius: 5 },
            origin,
            { seed: 1 },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(6);
        for (const point of result.positions) {
            const dist = Math.hypot(point.x - origin.x, point.z - origin.z);
            expect(dist).toBeCloseTo(5, 1);
        }
    });

    it('arranges a line pattern perpendicular to facing, spaced evenly', () => {
        const result = generateFormation(
            { pattern: 'line', count: 4, radius: 3, spacing: 2, facingRadians: 0 },
            origin,
            { seed: 2 },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(4);
        // facing 0: radius pushes along +x, spacing spreads along z.
        for (const point of result.positions) {
            expect(point.x).toBeCloseTo(3, 5);
        }
        const zs = result.positions.map((p) => p.z).sort((a, b) => a - b);
        expect(zs[1] - zs[0]).toBeCloseTo(2, 5);
    });

    it('arranges a wedge pattern with rows fanning outward from the origin', () => {
        const result = generateFormation(
            { pattern: 'wedge', count: 5, radius: 2, spacing: 1.5 },
            origin,
            { seed: 3 },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(5);
        // Every wedge point should be at least `radius` away from the origin.
        for (const point of result.positions) {
            const dist = Math.hypot(point.x - origin.x, point.z - origin.z);
            expect(dist).toBeGreaterThanOrEqual(2 - 1e-6);
        }
    });

    it('scatters points randomly within the radius band, deterministically by seed', () => {
        const spec = { pattern: 'scatter' as const, count: 8, radius: 10 };
        const first = generateFormation(spec, origin, { seed: 'scatter-seed' });
        const second = generateFormation(spec, origin, { seed: 'scatter-seed' });
        expect(first.positions).toEqual(second.positions);
        expect(first.complete).toBe(true);
        // scatter's radial term is `radius * (0.55 + rng * 0.65)`, so points can
        // land up to 1.2x the requested radius from the origin.
        for (const point of first.positions) {
            const dist = Math.hypot(point.x - origin.x, point.z - origin.z);
            expect(dist).toBeLessThanOrEqual(10 * 1.2 + 1e-6);
        }
    });

    it('scatter produces different layouts for different seeds', () => {
        const spec = { pattern: 'scatter' as const, count: 6, radius: 8 };
        const a = generateFormation(spec, origin, { seed: 'seed-a' });
        const b = generateFormation(spec, origin, { seed: 'seed-b' });
        expect(a.positions).not.toEqual(b.positions);
    });

    it('offsets every generated point by a non-origin world position', () => {
        const worldOrigin = { x: 100, y: 5, z: -40 };
        const result = generateFormation(
            { pattern: 'ring', count: 3, radius: 4 },
            worldOrigin,
            { seed: 9 },
        );
        expect(result.positions).toHaveLength(3);
        for (const point of result.positions) {
            expect(point.y).toBe(5);
        }
    });

    it('returns incomplete when constraints cannot be satisfied within maxAttempts', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 4, radius: 5 },
            origin,
            { seed: 1, maxAttempts: 4, isWalkable: () => false },
        );
        expect(result.complete).toBe(false);
        expect(result.positions).toHaveLength(0);
    });

    it('rejects a negative count', () => {
        expect(() => generateFormation(
            { pattern: 'ring', count: -1, radius: 5 },
            origin,
            { seed: 1 },
        )).toThrow(TypeError);
    });

    it('rejects a non-integer count', () => {
        expect(() => generateFormation(
            { pattern: 'ring', count: 2.5, radius: 5 },
            origin,
            { seed: 1 },
        )).toThrow(TypeError);
    });

    it('accepts a zero count and returns an empty, complete formation', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 0, radius: 5 },
            origin,
            { seed: 1 },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(0);
    });

    it('deduplicates coincident candidate points from repeated attempts', () => {
        // A single-slot line pattern (count=1) collapses every retry attempt onto
        // the same slot; each successive cycle nudges the radius by 15%, so
        // exactly one unique point is produced per cycle rather than duplicates.
        const result = generateFormation(
            { pattern: 'line', count: 1, radius: 3, spacing: 2 },
            origin,
            { seed: 1, maxAttempts: 1 },
        );
        expect(result.positions).toHaveLength(1);
        expect(result.complete).toBe(true);
    });

    it('spaces line-pattern slots at least the clamped minimum spacing apart', () => {
        // spec.spacing is clamped to a 0.25 floor, so even a spacing:0 request
        // still yields distinct, non-coincident slots.
        const result = generateFormation(
            { pattern: 'line', count: 2, radius: 3, spacing: 0 },
            origin,
            { seed: 1 },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(2);
        const [a, b] = result.positions;
        const gap = Math.hypot(a.x - b.x, a.z - b.z);
        expect(gap).toBeCloseTo(0.25, 5);
    });

    it('falls back to the default radius when spec.radius is omitted', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 4 },
            origin,
            { seed: 1 },
        );
        for (const point of result.positions) {
            const dist = Math.hypot(point.x - origin.x, point.z - origin.z);
            expect(dist).toBeCloseTo(6, 1);
        }
    });

    it('places a single-slot ambush point directly opposite facing (no spread)', () => {
        const result = generateFormation(
            { pattern: 'ambush', count: 1, radius: 5, facingRadians: 0 },
            origin,
            { seed: 1 },
        );
        expect(result.positions).toHaveLength(1);
        const [point] = result.positions;
        expect(point.x).toBeCloseTo(-5, 5);
        expect(point.z).toBeCloseTo(0, 5);
    });

    it('rejects candidates outside isWalkable and rejects visible candidates when avoiding', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 2, radius: 6 },
            origin,
            {
                seed: 5,
                isWalkable: (point) => point.x <= 0,
                avoidVisible: true,
                isVisibleFromPlayer: (point) => point.z < 0,
            },
        );
        expect(result.complete).toBe(true);
        for (const point of result.positions) {
            expect(point.x).toBeLessThanOrEqual(0);
            expect(point.z).toBeGreaterThanOrEqual(0);
        }
    });

    it('skips a candidate that lands within 0.1 units of an already-accepted point', () => {
        // A ring with a tiny radius and enough slots forces near-duplicate points
        // across successive cycles until the loose spacing pushes them apart.
        const result = generateFormation(
            { pattern: 'ring', count: 3, radius: 0.5 },
            origin,
            { seed: 1, maxAttempts: 60 },
        );
        expect(result.complete).toBe(true);
        for (let i = 0; i < result.positions.length; i += 1) {
            for (let j = i + 1; j < result.positions.length; j += 1) {
                const a = result.positions[i];
                const b = result.positions[j];
                expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.1);
            }
        }
    });

    it('rejects candidates closer than minDistance and retries', () => {
        const result = generateFormation(
            { pattern: 'scatter', count: 3, radius: 10 },
            origin,
            { seed: 'min-dist', minDistance: 8 },
        );
        for (const point of result.positions) {
            const dist = Math.hypot(point.x - origin.x, point.z - origin.z);
            expect(dist).toBeGreaterThanOrEqual(8);
        }
    });

    it('avoidVisible without an isVisibleFromPlayer callback accepts every candidate', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 4, radius: 5 },
            origin,
            { seed: 1, avoidVisible: true },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(4);
    });

    it('rejects candidates beyond maxDistance and retries with a larger cycle', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 2, radius: 6 },
            origin,
            { seed: 5, maxDistance: 5 },
        );
        // radius 6 always exceeds maxDistance 5 for every cycle (radius only grows),
        // so the formation can never complete — proving the maxDistance guard fired.
        expect(result.complete).toBe(false);
        expect(result.positions).toHaveLength(0);
    });

    it('rejects a ring slot whose first-cycle spacing falls under the 0.1 dedup threshold, retrying at a larger radius', () => {
        // radius is floored at 0.5; with 40 tightly-packed ring slots the arc
        // distance between first-cycle neighbours (~0.078) is under the dedup
        // guard's 0.1 threshold. Some slots are rejected on cycle 0 and only
        // accepted once a later, larger-radius cycle spaces them out enough —
        // proving every accepted point is at least 0.1 units from its peers.
        const result = generateFormation(
            { pattern: 'ring', count: 40, radius: 0.1 },
            origin,
            { seed: 1 },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(40);
        for (let i = 0; i < result.positions.length; i += 1) {
            for (let j = i + 1; j < result.positions.length; j += 1) {
                const a = result.positions[i];
                const b = result.positions[j];
                expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(0.1);
            }
        }
    });

    it('enforces minDistance and maxDistance range constraints', () => {
        const result = generateFormation(
            { pattern: 'ring', count: 4, radius: 5 },
            origin,
            { seed: 1, minDistance: 4, maxDistance: 6 },
        );
        for (const point of result.positions) {
            const dist = Math.hypot(point.x - origin.x, point.z - origin.z);
            expect(dist).toBeGreaterThanOrEqual(4);
            expect(dist).toBeLessThanOrEqual(6);
        }
    });
});
