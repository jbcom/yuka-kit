import { describe, expect, it } from 'vitest';
import { GameEntity, Think } from 'yuka';
import { BrainRegistry, createBrain } from './BrainRegistry.js';
import { WanderEvaluator } from './evaluators.js';
import type { AIEntity } from './AIEntity.js';

describe('createBrain', () => {
    it('builds a Think with the given evaluators and tags the entity back-reference', () => {
        const entity = new GameEntity();
        const evaluator = new WanderEvaluator();
        const brain = createBrain(entity, [evaluator]);
        expect(brain).toBeInstanceOf(Think);
        expect((entity as AIEntity)._brain).toBe(brain);
    });

    it('accepts an empty evaluator list', () => {
        const entity = new GameEntity();
        expect(() => createBrain(entity, [])).not.toThrow();
    });
});

describe('BrainRegistry', () => {
    it('registers, retrieves, and reports the size of registered brains', () => {
        const registry = new BrainRegistry();
        expect(registry.size).toBe(0);
        const entity = new GameEntity();
        const brain = createBrain(entity, []);
        registry.register('enemy-1', brain);
        expect(registry.size).toBe(1);
        expect(registry.get('enemy-1')).toBe(brain);
    });

    it('get returns undefined for an unregistered id', () => {
        const registry = new BrainRegistry();
        expect(registry.get('missing')).toBeUndefined();
    });

    it('unregister terminates and removes a registered brain', () => {
        const registry = new BrainRegistry();
        const entity = new GameEntity();
        const brain = createBrain(entity, []);
        registry.register('enemy-1', brain);
        registry.unregister('enemy-1');
        expect(registry.size).toBe(0);
        expect(registry.get('enemy-1')).toBeUndefined();
    });

    it('unregister on an unknown id is a no-op', () => {
        const registry = new BrainRegistry();
        expect(() => registry.unregister('never-registered')).not.toThrow();
    });

    it('updateAll executes every registered brain', () => {
        const registry = new BrainRegistry();
        const entityA = new GameEntity();
        const entityB = new GameEntity();
        registry.register('a', createBrain(entityA, []));
        registry.register('b', createBrain(entityB, []));
        expect(() => registry.updateAll()).not.toThrow();
    });

    it('reset terminates and clears every registered brain', () => {
        const registry = new BrainRegistry();
        registry.register('a', createBrain(new GameEntity(), []));
        registry.register('b', createBrain(new GameEntity(), []));
        expect(registry.size).toBe(2);
        registry.reset();
        expect(registry.size).toBe(0);
        expect(registry.get('a')).toBeUndefined();
    });

    it('reset on an already-empty registry is a no-op', () => {
        const registry = new BrainRegistry();
        expect(() => registry.reset()).not.toThrow();
        expect(registry.size).toBe(0);
    });
});
