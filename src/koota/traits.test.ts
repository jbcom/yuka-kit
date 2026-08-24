import { describe, expect, it } from 'vitest';
import { createWorld } from 'koota';
import { AIMemory, AIState, BossType, EnemyType, Intent, YukaRef } from './traits.js';

describe('koota traits — defaults', () => {
    it('AIState defaults to idle', () => {
        const world = createWorld();
        const entity = world.spawn(AIState);
        expect(entity.get(AIState)).toEqual({ state: 'idle' });
    });

    it('YukaRef defaults to a null vehicle reference', () => {
        const world = createWorld();
        const entity = world.spawn(YukaRef);
        expect(entity.get(YukaRef)).toEqual({ vehicle: null });
    });

    it('AIMemory defaults to a zeroed sighting record', () => {
        const world = createWorld();
        const entity = world.spawn(AIMemory);
        expect(entity.get(AIMemory)).toEqual({
            lastSeenX: 0,
            lastSeenY: 0,
            lastSeenZ: 0,
            lastSeenTime: 0,
        });
    });

    it('Intent defaults to an empty goal', () => {
        const world = createWorld();
        const entity = world.spawn(Intent);
        expect(entity.get(Intent)).toEqual({ goal: '' });
    });

    it('EnemyType defaults to an empty configId', () => {
        const world = createWorld();
        const entity = world.spawn(EnemyType);
        expect(entity.get(EnemyType)).toEqual({ configId: '' });
    });

    it('BossType defaults to an empty configId at phase 1', () => {
        const world = createWorld();
        const entity = world.spawn(BossType);
        expect(entity.get(BossType)).toEqual({ configId: '', phase: 1 });
    });
});
