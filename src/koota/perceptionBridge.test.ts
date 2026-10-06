import { afterEach, describe, expect, it } from 'vitest';
import { createWorld, trait, type World } from 'koota';
import { PerceptionMemory } from '../perception/memory.js';
import type { HeardNoise } from '../perception/hearing.js';
import { AIBridge } from './bridge.js';
import { AIAwareness, AIHearing, AIMemory, AIPerceptionMemory } from './traits.js';

const Position = trait({ x: 0, y: 0, z: 0 });
const Velocity = trait({ x: 0, y: 0, z: 0 });
const bridge = new AIBridge({ Position, Velocity });
const heard = (x: number, time: number, perceived = 2): HeardNoise => ({
    event: { position: { x, y: 0, z: 0 }, loudness: 5, kind: 'scream', time, source: 'mummy' },
    perceived,
    distance: x,
    transmission: 1,
});

const worlds: World[] = [];
const world = () => {
    const created = createWorld();
    worlds.push(created);
    return created;
};
afterEach(() => {
    for (const created of worlds.splice(0)) created.destroy();
});

describe('AIBridge.rememberNoise', () => {
    it('writes the noise onto AIHearing when the entity has it', () => {
        const entity = world().spawn(AIHearing);
        bridge.rememberNoise(entity, heard(4, 7, 1.5));
        expect(entity.get(AIHearing)).toEqual({
            lastHeardX: 4, lastHeardY: 0, lastHeardZ: 0, lastHeardTime: 7, lastHeardLoudness: 1.5, lastHeardKind: 'scream',
        });
    });

    it('does nothing without the trait', () => {
        const entity = world().spawn(Position);
        bridge.rememberNoise(entity, heard(4, 7));
        expect(entity.has(AIHearing)).toBe(false);
    });
});

describe('AIBridge.syncPerceptionMemory', () => {
    it('mirrors the strongest record onto awareness, sight, and hearing traits', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordSighting('mummy', { x: 1, y: 0, z: 2 }, 3);
        memory.recordNoise(heard(6, 5));
        memory.recordSighting('dog', { x: 9, y: 0, z: 9 }, 0, 0.3);
        const entity = world().spawn(AIPerceptionMemory({ memory }), AIAwareness, AIMemory, AIHearing);

        const record = bridge.syncPerceptionMemory(entity, 5);
        expect(record?.targetId).toBe('mummy');
        expect(entity.get(AIAwareness)).toEqual({
            targetId: 'mummy', confidence: record?.confidence, x: 6, y: 0, z: 0, time: 5, sense: 'hearing',
        });
        expect(entity.get(AIMemory)).toEqual({ lastSeenX: 1, lastSeenY: 0, lastSeenZ: 2, lastSeenTime: 3 });
        expect(entity.get(AIHearing)).toMatchObject({ lastHeardX: 6, lastHeardTime: 5, lastHeardLoudness: 2, lastHeardKind: 'scream' });
    });

    it('clears awareness once everything is forgotten', () => {
        const memory = new PerceptionMemory({ halfLife: 1 });
        memory.recordSighting('mummy', { x: 1, y: 0, z: 0 }, 0);
        const entity = world().spawn(AIPerceptionMemory({ memory }), AIAwareness);
        bridge.syncPerceptionMemory(entity, 0);
        expect(entity.get(AIAwareness)?.sense).toBe('sight');
        expect(bridge.syncPerceptionMemory(entity, 100)).toBeNull();
        expect(entity.get(AIAwareness)).toEqual({ targetId: '', confidence: 0, x: 0, y: 0, z: 0, time: 0, sense: '' });
    });

    it('skips missing traits and missing memory', () => {
        const memory = new PerceptionMemory({ halfLife: 10 });
        memory.recordNoise(heard(2, 0));
        const bare = world().spawn(AIPerceptionMemory({ memory }));
        expect(bridge.syncPerceptionMemory(bare, 0)?.targetId).toBe('mummy');
        expect(bare.has(AIAwareness)).toBe(false);

        const empty = world().spawn(AIPerceptionMemory, AIAwareness);
        expect(bridge.syncPerceptionMemory(empty, 0)).toBeNull();
        const none = world().spawn(Position);
        expect(bridge.syncPerceptionMemory(none, 0)).toBeNull();
    });
});
