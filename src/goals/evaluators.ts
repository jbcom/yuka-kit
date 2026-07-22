/**
 * Goal evaluators — each returns a desirability score [0, 1].
 *
 * Two wiring styles coexist deliberately (merged from bok + goats-in-hell):
 * - Entity-tag evaluators (Chase/MeleeAttack/KeepDistance/Wander/Flee) read
 *   the AIEntity `_targetPosition`/`_healthPct` tags the game loop refreshes
 *   each frame — the style bok's presets are built on.
 * - Getter-injected evaluators (Aggression/Survival/BossPhase) take accessor
 *   functions at construction — goats-in-hell's style, for games that prefer
 *   pulling from their own stores over tagging entities.
 */
import { GoalEvaluator, type GameEntity } from 'yuka';
import type { AIEntity } from './AIEntity.js';
// ─── Entity-tag evaluators (bok) ─────────────────────────────────────────────
/** Chase the target when nearby (but prefer attacking when very close). */
export class ChaseEvaluator extends GoalEvaluator {
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as AIEntity;
        const target = entity._targetPosition;
        if (!target)
            return 0;
        const dist = entity.position.distanceTo(target);
        // High desirability when target is in range but not too close
        if (dist < 2)
            return 0.1; // Too close — prefer attack
        if (dist < 15)
            return 0.7; // Chase range
        return 0.3; // Wander instead
    }
    setGoal(owner: GameEntity): void {
        const entity = owner as AIEntity;
        entity._brain?.clearSubgoals();
        // Chase movement itself is handled by steering behaviors on the Vehicle
    }
}
/** Attack when in melee range. */
export class MeleeAttackEvaluator extends GoalEvaluator {
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as AIEntity;
        const target = entity._targetPosition;
        if (!target)
            return 0;
        const dist = entity.position.distanceTo(target);
        return dist < 2 ? 0.9 : 0; // Very high when in melee range
    }
    setGoal(owner: GameEntity): void {
        const entity = owner as AIEntity;
        entity._brain?.clearSubgoals();
        // The attack itself is handled by the combat system based on proximity
    }
}
/** Keep distance for ranged attackers (hold an 8-12 unit band). */
export class KeepDistanceEvaluator extends GoalEvaluator {
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as AIEntity;
        const target = entity._targetPosition;
        if (!target)
            return 0;
        const dist = entity.position.distanceTo(target);
        if (dist < 6)
            return 0.8; // Too close — flee
        if (dist > 15)
            return 0.3; // Too far — approach
        return 0.5; // Good distance — hold
    }
    setGoal(): void {
        // Handled by flee steering behavior
    }
}
/** Wander when nothing better to do (always-available fallback). */
export class WanderEvaluator extends GoalEvaluator {
    calculateDesirability(): number {
        return 0.2; // Low priority — always available as fallback
    }
    setGoal(): void {
        // Wander behavior is always active on the Vehicle
    }
}
/** Flee when health is low (reads the `_healthPct` entity tag). */
export class FleeEvaluator extends GoalEvaluator {
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as AIEntity;
        const health = entity._healthPct ?? 1;
        if (health < 0.2)
            return 0.95; // Very low health — flee is top priority
        if (health < 0.4)
            return 0.5;
        return 0;
    }
    setGoal(): void {
        // Flee behavior activated by steering
    }
}
// ─── Getter-injected evaluators (goats-in-hell) ──────────────────────────────
/** Scores a constant aggression level scaled by characterBias. */
export class AggressionEvaluator extends GoalEvaluator {
    #aggression;
    constructor(characterBias = 1, aggression = 0.7) {
        super(characterBias);
        this.#aggression = aggression;
    }
    calculateDesirability(): number {
        return this.#aggression * this.characterBias;
    }
    setGoal(): void {
        // The composite goal built by the brain factory handles decomposition
    }
}
/** Scores high when HP is low — survival/flee pressure via an injected getter. */
export class SurvivalEvaluator extends GoalEvaluator {
    #getHpRatio;
    #threshold;
    constructor(getHpRatio: () => number, characterBias = 1, threshold = 0.3) {
        super(characterBias);
        this.#getHpRatio = getHpRatio;
        this.#threshold = threshold;
    }
    calculateDesirability(): number {
        const hpRatio = this.#getHpRatio();
        if (hpRatio > this.#threshold)
            return 0;
        return (1 - hpRatio) * this.characterBias;
    }
    setGoal(): void { }
}
/** Triggers phase-transition goals when HP drops below a threshold. */
export class BossPhaseEvaluator extends GoalEvaluator {
    #getHpRatio;
    #threshold;
    constructor(getHpRatio: () => number, threshold: number, characterBias = 1) {
        super(characterBias);
        this.#getHpRatio = getHpRatio;
        this.#threshold = threshold;
    }
    calculateDesirability(): number {
        const hpRatio = this.#getHpRatio();
        if (hpRatio > this.#threshold)
            return 0;
        return (1 - hpRatio) * this.characterBias;
    }
    setGoal(): void { }
}
