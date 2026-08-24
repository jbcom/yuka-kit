import { describe, expect, it } from 'vitest';
import { State, StateMachine, Vehicle } from 'yuka';
import {
    applyPerception,
    createVisionSensor,
    hasAabbLineOfSight2D,
    hasAabbProjectileClearance2D,
    inVisionCone,
    segmentIntersectsAabb2D,
} from './vision.js';

describe('segmentIntersectsAabb2D', () => {
    it('rejects a segment whose axis-clipped interval is empty (near > far)', () => {
        // A vertical-only segment that passes the obstacle's y band but whose
        // x-axis clip never overlaps its own y-axis clip once combined.
        const obstacle = { x: 10, y: 10, width: 1, height: 1 };
        const result = segmentIntersectsAabb2D({ x: 0, y: 0 }, { x: 0, y: 100 }, obstacle);
        expect(result).toBe(false);
    });

    it('reports no intersection for a segment entirely outside the obstacle on a flat axis', () => {
        // Horizontal segment (dy === 0) whose y falls outside the obstacle's
        // padded y band — exercises the axis-degenerate reject branch.
        const obstacle = { x: 5, y: 5, width: 2, height: 2 };
        expect(segmentIntersectsAabb2D({ x: 0, y: 0 }, { x: 10, y: 0 }, obstacle)).toBe(false);
    });

    it('rejects mid-loop when the per-axis clip intervals do not overlap at all', () => {
        // Both endpoints sit below and to the left of the obstacle, moving
        // further away — the x-axis and y-axis clip windows land at disjoint
        // t-ranges, so `near > far` fires inside the loop rather than after it.
        const obstacle = { x: 0, y: 0, width: 2, height: 2 };
        const result = segmentIntersectsAabb2D(
            { x: -3.2964956398802703, y: -6.405515262370766 },
            { x: -3.8969601122596065, y: -9.182844334475377 },
            obstacle,
        );
        expect(result).toBe(false);
    });
});

describe('hasAabbProjectileClearance2D', () => {
    it('handles a zero-distance shot (origin equals target) via the point-in-obstacle check', () => {
        const obstacle = { x: 0, y: 0, width: 4, height: 4 };
        const point = { x: 0, y: 0 };
        expect(hasAabbProjectileClearance2D(point, point, [obstacle], { radius: 1 })).toBe(false);
    });

    it('clears a zero-distance shot when outside every obstacle', () => {
        const obstacle = { x: 50, y: 50, width: 4, height: 4 };
        const point = { x: 0, y: 0 };
        expect(hasAabbProjectileClearance2D(point, point, [obstacle], { radius: 1 })).toBe(true);
    });

    it('defaults muzzleOffset and targetRadius to 0 when omitted', () => {
        expect(hasAabbProjectileClearance2D(
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            [],
            { radius: 1 },
        )).toBe(true);
    });

    it('clears a purely horizontal shot whose y falls outside the obstacle band', () => {
        // dy === 0 puts the trace on the flat-axis path; the obstacle's y band
        // does not contain the shot's y, so it must reject via the
        // axis-degenerate branch of the closed-endpoint trace.
        const obstacle = { x: 10, y: 10, width: 2, height: 2 };
        const result = hasAabbProjectileClearance2D(
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            [obstacle],
            { radius: 0 },
        );
        expect(result).toBe(true);
    });

    it('clears a shot whose clipped trace segment misses the obstacle on disjoint axis intervals', () => {
        // Mirrors the segmentIntersectsAabb2D "disjoint clip windows" case,
        // but reached through the closed-endpoint projectile trace instead.
        const obstacle = { x: 0, y: 0, width: 2, height: 2 };
        const result = hasAabbProjectileClearance2D(
            { x: -3.2964956398802703, y: -6.405515262370766 },
            { x: -3.8969601122596065, y: -9.182844334475377 },
            [obstacle],
            { radius: 0 },
        );
        expect(result).toBe(true);
    });

    it('clamps a negative radius, muzzleOffset, and targetRadius to zero', () => {
        expect(() => hasAabbProjectileClearance2D(
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            [],
            { radius: -5, muzzleOffset: -5, targetRadius: -5 },
        )).not.toThrow();
    });
});

describe('createVisionSensor', () => {
    it('sees when the raycast hits a target-qualifying entity', () => {
        const sensor = createVisionSensor(() => ({ tag: 'enemy' }), {
            range: 10,
            isTarget: (hit) => hit.tag === 'enemy',
        });
        expect(sensor.sees({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(true);
    });

    it('does not see when the raycast hits a non-target entity', () => {
        const sensor = createVisionSensor(() => ({ tag: 'wall' }), {
            range: 10,
            isTarget: (hit) => hit.tag === 'enemy',
        });
        expect(sensor.sees({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(false);
    });

    it('does not see when the raycast reports no hit', () => {
        const sensor = createVisionSensor(() => null, {
            range: 10,
            isTarget: () => true,
        });
        expect(sensor.sees({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBe(false);
    });

    it('passes origin, forward, and range through to the raycast adapter', () => {
        let received: unknown;
        const sensor = createVisionSensor(
            (origin, direction, range) => {
                received = { origin, direction, range };
                return null;
            },
            { range: 7, isTarget: () => true },
        );
        sensor.sees({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 1 });
        expect(received).toEqual({
            origin: { x: 1, y: 2, z: 3 },
            direction: { x: 0, y: 0, z: 1 },
            range: 7,
        });
    });
});

describe('inVisionCone', () => {
    const origin = { x: 0, y: 0, z: 0 };

    it('rejects a target beyond range', () => {
        expect(inVisionCone(origin, { x: 1, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, 5, Math.PI)).toBe(false);
    });

    it('always sees a co-located target regardless of forward or angle', () => {
        expect(inVisionCone(origin, { x: 1, y: 0, z: 0 }, origin, 5, 0)).toBe(true);
    });

    it('sees nothing when forward is a zero vector', () => {
        expect(inVisionCone(origin, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 5, Math.PI)).toBe(false);
    });

    it('rejects a target outside the cone half-angle', () => {
        expect(inVisionCone(origin, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 3 }, 5, Math.PI / 8)).toBe(false);
    });

    it('accepts a target exactly on the forward axis regardless of a tight angle', () => {
        expect(inVisionCone(origin, { x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, 5, 0.001)).toBe(true);
    });
});

describe('applyPerception', () => {
    function machineWithStates() {
        const fsm = new StateMachine(new Vehicle());
        fsm.add('idle', new State());
        fsm.add('pursuit', new State());
        fsm.changeTo('idle');
        return fsm;
    }

    it('does not transition when seen is false', () => {
        const fsm = machineWithStates();
        expect(applyPerception(false, fsm, 'pursuit')).toBe(false);
        expect(fsm.in('idle')).toBe(true);
    });

    it('does not transition when already in the target state', () => {
        const fsm = machineWithStates();
        fsm.changeTo('pursuit');
        expect(applyPerception(true, fsm, 'pursuit')).toBe(false);
        expect(fsm.in('pursuit')).toBe(true);
    });

    it('transitions and returns true when seen and not already in the target state', () => {
        const fsm = machineWithStates();
        expect(applyPerception(true, fsm, 'pursuit')).toBe(true);
        expect(fsm.in('pursuit')).toBe(true);
    });
});

describe('hasAabbLineOfSight2D', () => {
    it('is unblocked with no obstacles', () => {
        expect(hasAabbLineOfSight2D({ x: 0, y: 0 }, { x: 10, y: 0 }, [])).toBe(true);
    });
});
