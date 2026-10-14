import { describe, expect, it, vi } from 'vitest';
import { GameEntity, Goal, Think } from 'yuka';
import { BrainRegistry, createBrain } from './BrainRegistry.js';
import { WanderEvaluator } from './evaluators.js';
import type { AIEntity } from './AIEntity.js';

class TrackingGoal extends Goal {
    updates = 0;
    terminations = 0;

    execute(): void {
        this.updates += 1;
    }

    terminate(): void {
        this.terminations += 1;
    }
}

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
    function trackedBrain(): Think {
        return {
            execute: vi.fn(),
            terminate: vi.fn(),
        } as unknown as Think;
    }

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

    it('replaces an active brain by terminating it and ticking only its replacement', () => {
        const registry = new BrainRegistry();
        const previous = trackedBrain();
        const replacement = trackedBrain();

        registry.register('enemy-1', previous);
        registry.updateAll();
        registry.register('enemy-1', replacement);
        registry.updateAll();

        expect(previous.terminate).toHaveBeenCalledOnce();
        expect(previous.execute).toHaveBeenCalledOnce();
        expect(replacement.execute).toHaveBeenCalledOnce();
        expect(registry.get('enemy-1')).toBe(replacement);
    });

    it('cleans up active Yuka subgoals before replacing a real brain', () => {
        const registry = new BrainRegistry();
        const entity = new GameEntity();
        const brain = createBrain(entity, []);
        const activeGoal = new TrackingGoal(entity);
        const replacement = trackedBrain();
        brain.addSubgoal(activeGoal);

        registry.register('enemy-1', brain);
        registry.updateAll();
        registry.register('enemy-1', replacement);
        registry.updateAll();

        expect(activeGoal.updates).toBe(1);
        expect(activeGoal.terminations).toBe(1);
        expect(brain.subgoals).toEqual([]);
        expect(replacement.execute).toHaveBeenCalledOnce();
    });

    it('does not terminate or duplicate a brain registered under its existing id', () => {
        const registry = new BrainRegistry();
        const brain = trackedBrain();

        registry.register('enemy-1', brain);
        registry.register('enemy-1', brain);
        registry.updateAll();

        expect(brain.terminate).not.toHaveBeenCalled();
        expect(brain.execute).toHaveBeenCalledOnce();
        expect(registry.size).toBe(1);
    });

    it('unregister terminates and removes a registered brain', () => {
        const registry = new BrainRegistry();
        const brain = trackedBrain();
        registry.register('enemy-1', brain);
        registry.unregister('enemy-1');
        expect(brain.terminate).toHaveBeenCalledOnce();
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
        const brainA = trackedBrain();
        const brainB = trackedBrain();
        registry.register('a', brainA);
        registry.register('b', brainB);
        expect(registry.size).toBe(2);
        registry.reset();
        expect(brainA.terminate).toHaveBeenCalledOnce();
        expect(brainB.terminate).toHaveBeenCalledOnce();
        expect(registry.size).toBe(0);
        expect(registry.get('a')).toBeUndefined();
    });

    it('reset on an already-empty registry is a no-op', () => {
        const registry = new BrainRegistry();
        expect(() => registry.reset()).not.toThrow();
        expect(registry.size).toBe(0);
    });
});
