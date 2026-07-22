import { createBrain } from '../goals/BrainRegistry.js';
import { createBossBrain } from '../goals/bossBrain.js';
import { ChaseEvaluator, FleeEvaluator, KeepDistanceEvaluator, MeleeAttackEvaluator, WanderEvaluator, } from '../goals/evaluators.js';
import type { GameEntity, GoalEvaluator, Think } from 'yuka';
import type { AIType } from '../core/types.js';
import type { BossPhaseConfig } from '../goals/bossBrain.js';
/**
 * Evaluator bundles per AI archetype. Factories (not shared instances):
 * every brain gets fresh evaluators.
 *
 * - melee:   chase + melee attack (skeleton, goblin, zombie)
 * - ranged:  keep distance + shoot (wizard, archer)
 * - pack:    aggressive group chase (wolves)
 * - ambush:  mostly wander, attack hard when close (lurkers)
 * - boss:    fallback bundle when no phase data is provided (see createBrainForType)
 * - passive: wander only (animals)
 */
export const AI_TYPE_PRESETS: Record<AIType, () => GoalEvaluator[]> = {
    melee: () => [
        new ChaseEvaluator(0.7),
        new MeleeAttackEvaluator(1.0),
        new WanderEvaluator(0.2),
        new FleeEvaluator(0.5),
    ],
    ranged: () => [new KeepDistanceEvaluator(0.8), new WanderEvaluator(0.2), new FleeEvaluator(0.6)],
    pack: () => [new ChaseEvaluator(0.9), new MeleeAttackEvaluator(1.0), new WanderEvaluator(0.1)],
    ambush: () => [new WanderEvaluator(0.6), new MeleeAttackEvaluator(1.0)],
    boss: () => [new ChaseEvaluator(0.5), new MeleeAttackEvaluator(1.0)],
    passive: () => [new WanderEvaluator(1.0)],
};
/**
 * Create a Think brain for an entity based on its AI type.
 *
 * For the 'boss' type, pass `bossPhases` to get a full phase-aware BossBrain;
 * without phases it falls back to a simple chase+attack bundle.
 */
export function createBrainForType(
    entity: GameEntity,
    aiType: AIType,
    bossPhases?: readonly BossPhaseConfig[],
): Think {
    if (aiType === 'boss' && bossPhases && bossPhases.length > 0) {
        return createBossBrain(entity, bossPhases);
    }
    return createBrain(entity, AI_TYPE_PRESETS[aiType]());
}
