import { describe, expect, it } from 'vitest';
import { EncounterDirector } from './EncounterDirector.js';
import { generateFormation } from './formations.js';
import type { EncounterProbe, EncounterTableEntry } from './types.js';

const probe = (step: number): EncounterProbe => ({
    step,
    mapId: 'thornwood',
    level: 4,
    playerPosition: { x: 10, y: 0, z: 10 },
});

const table: EncounterTableEntry<{ enemies: string[] }>[] = [
    { id: 'wolves', weight: 3, payload: { enemies: ['wolf', 'wolf'] } },
    { id: 'bandits', weight: 1, payload: { enemies: ['bandit'] } },
];

describe('EncounterDirector', () => {
    it('uses deterministic Yuka evaluator arbitration and serializable state', () => {
        const first = new EncounterDirector({ seed: 'quest', baseChance: 1, minStepsBetweenEncounters: 0 });
        const second = new EncounterDirector({ seed: 'quest', baseChance: 1, minStepsBetweenEncounters: 0 });

        const a = first.consider(probe(1), table);
        const b = second.consider(probe(1), table);
        expect(a).toEqual(b);
        expect(a.spawned).toBe(true);

        const snapshot = first.snapshot();
        expect(() => JSON.stringify(snapshot)).not.toThrow();
        const restored = new EncounterDirector({ seed: 'different', baseChance: 1, minStepsBetweenEncounters: 0 });
        restored.restore(snapshot);
        expect(restored.consider(probe(2), table)).toEqual(first.consider(probe(2), table));
    });

    it('honors safe zones, duplicate steps, entry gates, and cooldowns', () => {
        const director = new EncounterDirector({ seed: 7, baseChance: 1, minStepsBetweenEncounters: 0 });
        expect(director.consider({ ...probe(1), safe: true }, table)).toEqual({ spawned: false, reason: 'safe' });
        expect(director.consider(probe(1), table)).toEqual({ spawned: false, reason: 'duplicate-step' });

        const gated: EncounterTableEntry[] = [{ id: 'unique', weight: 1, cooldownSteps: 10, minLevel: 3 }];
        expect(director.consider(probe(2), gated).spawned).toBe(true);
        expect(director.consider(probe(3), gated)).toEqual({ spawned: false, reason: 'no-eligible-entry' });
    });
});

describe('generateFormation', () => {
    it('returns only walkable, hidden ambush points within range', () => {
        const result = generateFormation(
            { pattern: 'ambush', count: 4, radius: 6, facingRadians: 0 },
            { x: 0, y: 0, z: 0 },
            {
                seed: 42,
                minDistance: 4,
                maxDistance: 10,
                avoidVisible: true,
                isVisibleFromPlayer: (point) => point.x > 0,
                isWalkable: (point) => Math.abs(point.z) > 0.1,
            },
        );
        expect(result.complete).toBe(true);
        expect(result.positions).toHaveLength(4);
        expect(result.positions.every((point) => point.x <= 0)).toBe(true);
    });
});

