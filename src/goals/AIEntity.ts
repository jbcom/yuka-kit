import type { GameEntity, Think, Vector3 } from 'yuka';

export interface AIEntity extends GameEntity {
    _targetPosition?: Vector3;
    _brain?: Think;
    _healthPct?: number;
}

/** Tag the entity with the target's live position (evaluator input). */
export function setTargetPosition(entity: GameEntity, target: Vector3): void {
    (entity as AIEntity)._targetPosition = target;
}
/** Tag the entity with its current health fraction [0, 1] (evaluator input). */
export function setHealthPct(entity: GameEntity, healthPct: number): void {
    (entity as AIEntity)._healthPct = healthPct;
}
