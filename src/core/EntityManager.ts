import { EntityManager, type GameEntity } from 'yuka';
import type { BrainRegistry } from '../goals/BrainRegistry.js';
/**
 * Thin wrapper around yuka.EntityManager — one manager per world/scene.
 * Kept as a factory (not a singleton) so multiple worlds/tests never share
 * AI state.
 */
export function createEntityManager() {
    return new EntityManager();
}
/** Register an entity with a manager and return it (fluent convenience). */
export function manage<T extends GameEntity>(manager: EntityManager, entity: T): T {
    manager.add(entity);
    return entity;
}
/**
 * Advance one AI tick: steering/entity update first, then goal arbitration
 * (the order goats-in-hell's brain loop established).
 */
export function stepAI(
    manager: EntityManager,
    delta: number,
    brains?: BrainRegistry,
): void {
    manager.update(delta);
    brains?.updateAll();
}
