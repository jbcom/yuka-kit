import { describe, expect, it } from 'vitest';
import { GameEntity, Vector3 } from 'yuka';
import type { AIEntity } from './AIEntity.js';
import { setHealthPct, setTargetPosition } from './AIEntity.js';

describe('setTargetPosition', () => {
    it('tags the entity with a live target position reference', () => {
        const entity = new GameEntity();
        const target = new Vector3(1, 2, 3);
        setTargetPosition(entity, target);
        expect((entity as AIEntity)._targetPosition).toBe(target);
    });
});

describe('setHealthPct', () => {
    it('tags the entity with the given health fraction', () => {
        const entity = new GameEntity();
        setHealthPct(entity, 0.42);
        expect((entity as AIEntity)._healthPct).toBe(0.42);
    });

    it('overwrites a previously set health fraction', () => {
        const entity = new GameEntity();
        setHealthPct(entity, 1);
        setHealthPct(entity, 0);
        expect((entity as AIEntity)._healthPct).toBe(0);
    });
});
