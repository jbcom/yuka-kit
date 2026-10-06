import { describe, expect, it } from 'vitest';
import { createLitVisionSensor, inLitVisionCone, lightScaledRange } from '../index.js';
import type { Vec3Like } from '../core/types.js';

const origin = { x: 0, y: 0, z: 0 };
const forward = { x: 1, y: 0, z: 0 };
const at = (x: number, z = 0) => ({ x, y: 0, z });

describe('lightScaledRange', () => {
    it('interpolates between minRange and range by light ** exponent', () => {
        expect(lightScaledRange(1, { range: 20 })).toBe(20);
        expect(lightScaledRange(0, { range: 20 })).toBe(0);
        expect(lightScaledRange(0.5, { range: 20, minRange: 2 })).toBe(11);
        expect(lightScaledRange(0.5, { range: 20, exponent: 2 })).toBe(5);
        expect(lightScaledRange(3, { range: 20 })).toBe(20); // floodlight clamps
        expect(lightScaledRange(-1, { range: 20, minRange: 2 })).toBe(2);
    });

    it('rejects invalid light and options', () => {
        expect(() => lightScaledRange(Number.NaN, { range: 1 })).toThrow(/Light level must be finite/);
        expect(() => lightScaledRange(1, { range: -1 })).toThrow(/range must be finite/);
        expect(() => lightScaledRange(1, { range: 5, minRange: 6 })).toThrow(/minRange/);
        expect(() => lightScaledRange(1, { range: 5, exponent: 0 })).toThrow(/exponent/);
    });
});

describe('inLitVisionCone', () => {
    it('sees a lit target that it misses in darkness at the same distance', () => {
        const options = (light: number) => ({ range: 20, minRange: 2, halfAngleRad: Math.PI / 4, lightAt: () => light });
        expect(inLitVisionCone(origin, forward, at(10), options(1))).toBe(true);
        expect(inLitVisionCone(origin, forward, at(10), options(0.2))).toBe(false);
        // minRange: a dog notices anything close, light or not.
        expect(inLitVisionCone(origin, forward, at(1.5), options(0))).toBe(true);
        // The cone still applies.
        expect(inLitVisionCone(origin, forward, at(-5), options(1))).toBe(false);
    });

    it('reads light at the target position and rejects non-finite light', () => {
        const seen: Vec3Like[] = [];
        inLitVisionCone(origin, forward, at(3, 1), {
            range: 10, halfAngleRad: Math.PI, lightAt: (target) => {
                seen.push(target);
                return 1;
            },
        });
        expect(seen).toEqual([at(3, 1)]);
        expect(() => inLitVisionCone(origin, forward, at(1), { range: 1, halfAngleRad: 1, lightAt: () => Number.NaN }))
            .toThrow(/lightAt must return a finite number/);
    });
});

describe('createLitVisionSensor', () => {
    it('casts a unit ray toward the target with the light-scaled range', () => {
        const casts: Array<{ direction: Vec3Like; range: number }> = [];
        const sensor = createLitVisionSensor((_, direction, range) => {
            casts.push({ direction, range });
            return 'mummy';
        }, { range: 20, isTarget: (hit) => hit === 'mummy', lightAt: (target) => (target.x > 5 ? 0.25 : 1) });
        expect(sensor.rangeFor(at(10))).toBe(5);
        expect(sensor.seesTarget(origin, at(4))).toBe(true);
        expect(casts).toEqual([{ direction: { x: 1, y: 0, z: 0 }, range: 20 }]);
        expect(sensor.seesTarget(origin, at(10))).toBe(false); // too dark at 10m: no cast
        expect(casts).toHaveLength(1);
        expect(sensor.seesTarget(origin, origin)).toBe(true);
    });

    it('requires the ray to hit the target', () => {
        const blocked = createLitVisionSensor(() => 'wall', { range: 20, isTarget: (hit) => hit === 'mummy', lightAt: () => 1 });
        expect(blocked.seesTarget(origin, at(3))).toBe(false);
        const missed = createLitVisionSensor(() => null, { range: 20, isTarget: () => true, lightAt: () => 1 });
        expect(missed.seesTarget(origin, at(3))).toBe(false);
        expect(() => createLitVisionSensor(() => null, { range: 5, minRange: 9, isTarget: () => true, lightAt: () => 1 }))
            .toThrow(/minRange/);
    });
});
