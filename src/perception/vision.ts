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

export interface Point2Like {
    x: number;
    y: number;
}

export interface Aabb2Like extends Point2Like {
    width: number;
    height: number;
}

export interface AabbProjectileClearanceOptions {
    /** Collision radius used to expand authored obstacles. */
    radius: number;
    /** Distance from the attacker centre to the projectile spawn point. */
    muzzleOffset?: number;
    /** Target collision radius; lets the trace stop at the first valid impact. */
    targetRadius?: number;
}

/**
 * Tests an open line segment against a center-positioned 2D AABB. Endpoint
 * intersections are ignored so actors standing against a wall can still see
 * out of their own cell.
 */
export function segmentIntersectsAabb2D(
    from: Point2Like,
    to: Point2Like,
    obstacle: Aabb2Like,
    padding = 0,
): boolean {
    const minX = obstacle.x - obstacle.width / 2 - padding;
    const maxX = obstacle.x + obstacle.width / 2 + padding;
    const minY = obstacle.y - obstacle.height / 2 - padding;
    const maxY = obstacle.y + obstacle.height / 2 + padding;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let near = 0;
    let far = 1;
    for (const [origin, delta, min, max] of [
        [from.x, dx, minX, maxX],
        [from.y, dy, minY, maxY],
    ] as const) {
        if (Math.abs(delta) < Number.EPSILON) {
            if (origin < min || origin > max)
                return false;
            continue;
        }
        const first = (min - origin) / delta;
        const second = (max - origin) / delta;
        near = Math.max(near, Math.min(first, second));
        far = Math.min(far, Math.max(first, second));
        if (near > far)
            return false;
    }
    return near > 0.01 && near < 0.99;
}

/** True when no supplied 2D obstacle blocks the open segment. */
export function hasAabbLineOfSight2D(
    from: Point2Like,
    to: Point2Like,
    obstacles: readonly Aabb2Like[],
    padding = 0,
): boolean {
    return !obstacles.some((obstacle) => segmentIntersectsAabb2D(from, to, obstacle, padding));
}

const pointInsidePaddedAabb2D = (
    point: Point2Like,
    obstacle: Aabb2Like,
    padding: number,
): boolean =>
    point.x >= obstacle.x - obstacle.width / 2 - padding &&
    point.x <= obstacle.x + obstacle.width / 2 + padding &&
    point.y >= obstacle.y - obstacle.height / 2 - padding &&
    point.y <= obstacle.y + obstacle.height / 2 + padding;

const segmentIntersectsClosedAabb2D = (
    from: Point2Like,
    to: Point2Like,
    obstacle: Aabb2Like,
    padding: number,
): boolean => {
    const minX = obstacle.x - obstacle.width / 2 - padding;
    const maxX = obstacle.x + obstacle.width / 2 + padding;
    const minY = obstacle.y - obstacle.height / 2 - padding;
    const maxY = obstacle.y + obstacle.height / 2 + padding;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let near = 0;
    let far = 1;
    for (const [origin, delta, min, max] of [
        [from.x, dx, minX, maxX],
        [from.y, dy, minY, maxY],
    ] as const) {
        if (Math.abs(delta) < Number.EPSILON) {
            if (origin < min || origin > max) return false;
            continue;
        }
        const first = (min - origin) / delta;
        const second = (max - origin) / delta;
        near = Math.max(near, Math.min(first, second));
        far = Math.min(far, Math.max(first, second));
        if (near > far) return false;
    }
    return far >= 0 && near <= 1;
};

/**
 * True when a projectile can travel from its forward spawn point to the first
 * possible target impact without overlapping a center-positioned AABB.
 *
 * Unlike visual line of sight, the projectile origin is a closed endpoint:
 * spawning inside a radius-expanded wall is blocked instead of being treated
 * as an actor standing close enough to see past that wall.
 */
export function hasAabbProjectileClearance2D(
    from: Point2Like,
    to: Point2Like,
    obstacles: readonly Aabb2Like[],
    options: AabbProjectileClearanceOptions,
): boolean {
    const radius = Math.max(0, options.radius);
    const muzzleOffset = Math.max(0, options.muzzleOffset ?? 0);
    const targetRadius = Math.max(0, options.targetRadius ?? 0);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= Number.EPSILON) {
        return !obstacles.some((obstacle) => pointInsidePaddedAabb2D(from, obstacle, radius));
    }

    const direction = { x: dx / distance, y: dy / distance };
    const originDistance = Math.min(distance, muzzleOffset);
    const impactDistance = Math.max(
        originDistance,
        distance - radius - targetRadius,
    );
    const origin = {
        x: from.x + direction.x * originDistance,
        y: from.y + direction.y * originDistance,
    };
    const impact = {
        x: from.x + direction.x * impactDistance,
        y: from.y + direction.y * impactDistance,
    };

    return !obstacles.some((obstacle) => {
        if (pointInsidePaddedAabb2D(origin, obstacle, radius)) return true;
        return segmentIntersectsClosedAabb2D(origin, impact, obstacle, radius);
    });
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
