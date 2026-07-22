import type { Vec3Like } from '../core/types.js';
import { SeededRandom } from '../random/SeededRandom.js';
import type { FormationConstraints, FormationResult, FormationSpec } from './types.js';

const distance = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.z - b.z);

const candidateAt = (
    spec: FormationSpec,
    origin: Vec3Like,
    attempt: number,
    rng: SeededRandom,
): Vec3Like => {
    const count = Math.max(1, Math.floor(spec.count));
    const slot = attempt % count;
    const cycle = Math.floor(attempt / count);
    const radius = Math.max(0.5, spec.radius ?? 6) * (1 + cycle * 0.15);
    const spacing = Math.max(0.25, spec.spacing ?? 1.5);
    const facing = spec.facingRadians ?? 0;
    let x = 0;
    let z = 0;

    switch (spec.pattern) {
        case 'ring': {
            const angle = facing + (slot / count) * Math.PI * 2 + cycle * 0.31;
            x = Math.cos(angle) * radius;
            z = Math.sin(angle) * radius;
            break;
        }
        case 'ambush': {
            const spread = count === 1 ? 0 : (slot / (count - 1) - 0.5) * Math.PI * 0.9;
            const angle = facing + Math.PI + spread + cycle * 0.17;
            x = Math.cos(angle) * radius;
            z = Math.sin(angle) * radius;
            break;
        }
        case 'line': {
            const offset = (slot - (count - 1) / 2) * spacing;
            x = Math.cos(facing + Math.PI / 2) * offset + Math.cos(facing) * radius;
            z = Math.sin(facing + Math.PI / 2) * offset + Math.sin(facing) * radius;
            break;
        }
        case 'wedge': {
            const row = Math.floor(Math.sqrt(slot));
            const indexInRow = slot - row * row;
            const lateral = (indexInRow - row) * spacing;
            const forward = radius + row * spacing;
            x = Math.cos(facing) * forward + Math.cos(facing + Math.PI / 2) * lateral;
            z = Math.sin(facing) * forward + Math.sin(facing + Math.PI / 2) * lateral;
            break;
        }
        case 'scatter': {
            const angle = rng.next() * Math.PI * 2;
            const radial = radius * (0.55 + rng.next() * 0.65);
            x = Math.cos(angle) * radial;
            z = Math.sin(angle) * radial;
            break;
        }
    }

    return { x: origin.x + x, y: origin.y, z: origin.z + z };
};

/** Generate spawn points while enforcing walkability, sight, and range constraints. */
export function generateFormation(
    spec: FormationSpec,
    origin: Vec3Like,
    constraints: FormationConstraints,
): FormationResult {
    if (!Number.isInteger(spec.count) || spec.count < 0) {
        throw new TypeError('Formation count must be a non-negative integer');
    }
    const rng = new SeededRandom(constraints.seed);
    const positions: Vec3Like[] = [];
    const maxAttempts = Math.max(spec.count, constraints.maxAttempts ?? spec.count * 12);

    for (let attempt = 0; attempt < maxAttempts && positions.length < spec.count; attempt += 1) {
        const point = candidateAt(spec, origin, attempt, rng);
        const range = distance(origin, point);
        if (constraints.minDistance !== undefined && range < constraints.minDistance) continue;
        if (constraints.maxDistance !== undefined && range > constraints.maxDistance) continue;
        if (constraints.isWalkable && !constraints.isWalkable(point)) continue;
        if (constraints.avoidVisible && constraints.isVisibleFromPlayer?.(point)) continue;
        if (positions.some((existing) => distance(existing, point) < 0.1)) continue;
        positions.push(point);
    }

    return { positions, complete: positions.length === spec.count };
}

