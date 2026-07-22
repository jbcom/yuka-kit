import type { StateMachine } from 'yuka';
import type { Vec3Like } from '../core/types.js';

export type RaycastFn<Hit> = (
    origin: Vec3Like,
    direction: Vec3Like,
    range: number,
) => Hit | null;

export interface VisionSensorOptions<Hit> {
    range: number;
    isTarget: (hit: Hit) => boolean;
}

export interface VisionSensor {
    sees(origin: Vec3Like, forward: Vec3Like): boolean;
}

/** Build a line-of-sight sensor over a physics raycast adapter. */
export function createVisionSensor<Hit>(
    raycast: RaycastFn<Hit>,
    options: VisionSensorOptions<Hit>,
): VisionSensor {
    return {
        sees(origin, forward) {
            const hit = raycast(origin, forward, options.range);
            return hit !== null && options.isTarget(hit);
        },
    };
}
/**
 * Pure-math vision-cone test: is `target` within `range` of `origin` AND
 * inside the cone of half-angle `halfAngleRad` around `forward`?
 * (`forward` need not be normalized; a zero forward vector sees nothing.)
 */
export function inVisionCone(
    origin: Vec3Like,
    forward: Vec3Like,
    target: Vec3Like,
    range: number,
    halfAngleRad: number,
): boolean {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > range * range)
        return false;
    if (distSq === 0)
        return true; // co-located — always "visible"
    const fLen = Math.sqrt(forward.x * forward.x + forward.y * forward.y + forward.z * forward.z);
    if (fLen === 0)
        return false;
    const dot = (dx * forward.x + dy * forward.y + dz * forward.z) / (Math.sqrt(distSq) * fLen);
    // Clamp against float drift before comparing angles
    return Math.acos(Math.min(1, Math.max(-1, dot))) <= halfAngleRad;
}
/**
 * The perception → FSM pattern from aethermoor: when `seen` is true and the
 * FSM isn't already in `stateWhenSeen`, transition to it. Returns true when
 * a transition fired.
 */
export function applyPerception(
    seen: boolean,
    fsm: StateMachine,
    stateWhenSeen: string,
): boolean {
    if (!seen || fsm.in(stateWhenSeen))
        return false;
    fsm.changeTo(stateWhenSeen);
    return true;
}
