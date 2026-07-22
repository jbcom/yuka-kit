import { Think, type GameEntity, type GoalEvaluator } from 'yuka';
import type { AIEntity } from './AIEntity.js';
/**
 * Create a Think brain for an entity from a set of evaluators, and tag the
 * entity with a back-reference (`_brain`) so evaluators can clear subgoals.
 */
export function createBrain(
    entity: GameEntity,
    evaluators: readonly GoalEvaluator[],
): Think {
    const brain = new Think(entity);
    (entity as AIEntity)._brain = brain;
    for (const evaluator of evaluators) {
        brain.addEvaluator(evaluator);
    }
    return brain;
}
/**
 * BrainRegistry — manages Think brain lifecycle for all AI-controlled
 * entities (from goats-in-hell). Each entity gets a brain registered by id;
 * the registry ticks all brains once per frame.
 *
 * Instantiate one per world/scene — deliberately not a module singleton so
 * multiple worlds and tests never share brains.
 */
export class BrainRegistry {
    #brains = new Map<string, Think>();
    register(entityId: string, brain: Think): void {
        this.#brains.set(entityId, brain);
    }
    unregister(entityId: string): void {
        const brain = this.#brains.get(entityId);
        if (brain) {
            brain.terminate();
            this.#brains.delete(entityId);
        }
    }
    get(entityId: string): Think | undefined {
        return this.#brains.get(entityId);
    }
    get size() {
        return this.#brains.size;
    }
    /** Tick all registered brains. Call once per frame after steering. */
    updateAll(): void {
        for (const brain of this.#brains.values()) {
            brain.execute();
        }
    }
    /** Clear all brains (e.g. on floor/level transition). */
    reset(): void {
        for (const brain of this.#brains.values()) {
            brain.terminate();
        }
        this.#brains.clear();
    }
}
