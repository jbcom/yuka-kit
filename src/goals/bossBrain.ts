/**
 * Phase-aware boss AI using yuka CompositeGoal trees (from bok's bossBrain,
 * decoupled from bok's content schema via BossPhaseConfig).
 *
 * Each boss gets a BossBrain (extends Think) that switches behavior at
 * health-percentage thresholds. Evaluators compete via desirability scores
 * that shift as phases advance, producing emergent boss patterns:
 *
 * - Phase 1 (full health): measured, circle-strafe + ranged
 * - Phase 2 (mid health): aggressive chase + summon minions
 * - Phase 3 (low health): enraged all-out melee + desperate attacks
 */
import { Goal, GoalEvaluator, Think, type GameEntity } from 'yuka';
import type { AIEntity } from './AIEntity.js';

export interface BossAttackConfig {
    type: string;
}

export interface BossPhaseConfig {
    healthThreshold: number;
    attacks: readonly BossAttackConfig[];
}

export type BossBehavior =
    | 'circle-strafe'
    | 'aggressive-chase'
    | 'retreat-and-summon'
    | 'ranged-barrage'
    | 'enrage';

export interface BossEntity extends AIEntity {
    _bossPhase?: number;
    _activeBehavior?: BossBehavior;
}
// ─── Goal evaluators — each returns a desirability score [0, 1] ──────────────
/**
 * Orbit the target at attack range. Preferred in early phases when the boss
 * is methodical and uses ranged/AoE attacks at medium distance.
 */
export class CircleStrafeEvaluator extends GoalEvaluator {
    /** Phase bias multipliers: [phase1, phase2, phase3] */
    #phaseBiases;
    constructor(characterBias: number, phaseBiases = [1.0, 0.4, 0.1]) {
        super(characterBias);
        this.#phaseBiases = phaseBiases;
    }
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as BossEntity;
        const target = entity._targetPosition;
        if (!target)
            return 0;
        const dist = entity.position.distanceTo(target);
        const phase = entity._bossPhase ?? 0;
        const phaseMul = this.#phaseBiases[Math.min(phase, this.#phaseBiases.length - 1)];
        // Sweet spot: 5-10 units — good orbit distance
        if (dist >= 5 && dist <= 10)
            return 0.7 * phaseMul;
        // Acceptable: 3-12 units
        if (dist >= 3 && dist <= 12)
            return 0.4 * phaseMul;
        return 0.1 * phaseMul;
    }
    setGoal(owner: GameEntity): void {
        const entity = owner as BossEntity;
        entity._brain?.clearSubgoals();
        // Steering is applied by the game loop based on the active behavior tag.
        entity._activeBehavior = 'circle-strafe';
    }
}
/**
 * Chase the target aggressively for melee attacks. Desirability increases
 * in later phases when the boss becomes more aggressive.
 */
export class AggressiveChaseEvaluator extends GoalEvaluator {
    #phaseBiases;
    constructor(characterBias: number, phaseBiases = [0.3, 0.7, 0.9]) {
        super(characterBias);
        this.#phaseBiases = phaseBiases;
    }
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as BossEntity;
        const target = entity._targetPosition;
        if (!target)
            return 0;
        const dist = entity.position.distanceTo(target);
        const phase = entity._bossPhase ?? 0;
        const phaseMul = this.#phaseBiases[Math.min(phase, this.#phaseBiases.length - 1)];
        // High desirability when target is in chase range but not already in melee
        if (dist > 2 && dist < 15)
            return 0.6 * phaseMul;
        // Already in melee — moderate (let enrage or circle take over)
        if (dist <= 2)
            return 0.3 * phaseMul;
        // Too far — still want to close distance
        return 0.2 * phaseMul;
    }
    setGoal(owner: GameEntity): void {
        const entity = owner as BossEntity;
        entity._brain?.clearSubgoals();
        entity._activeBehavior = 'aggressive-chase';
    }
}
/**
 * Retreat from the target and summon minions. Most desirable in phase 2
 * when the boss has summon-type attacks available.
 */
export class RetreatAndSummonEvaluator extends GoalEvaluator {
    #phaseBiases;
    constructor(characterBias: number, phaseBiases = [0.1, 0.8, 0.5]) {
        super(characterBias);
        this.#phaseBiases = phaseBiases;
    }
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as BossEntity;
        const target = entity._targetPosition;
        if (!target)
            return 0;
        const dist = entity.position.distanceTo(target);
        const phase = entity._bossPhase ?? 0;
        const phaseMul = this.#phaseBiases[Math.min(phase, this.#phaseBiases.length - 1)];
        // High when target is close (need to retreat)
        if (dist < 4)
            return 0.7 * phaseMul;
        // Moderate at medium range
        if (dist < 8)
            return 0.4 * phaseMul;
        // Low when already far away
        return 0.1 * phaseMul;
    }
    setGoal(owner: GameEntity): void {
        const entity = owner as BossEntity;
        entity._brain?.clearSubgoals();
        entity._activeBehavior = 'retreat-and-summon';
    }
}
/**
 * Rapid ranged attacks from a distance. Preferred when the boss has ranged
 * attacks and the target is at medium-long range.
 */
export class RangedBarrageEvaluator extends GoalEvaluator {
    #phaseBiases;
    constructor(characterBias: number, phaseBiases = [0.6, 0.5, 0.3]) {
        super(characterBias);
        this.#phaseBiases = phaseBiases;
    }
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as BossEntity;
        const target = entity._targetPosition;
        if (!target)
            return 0;
        const dist = entity.position.distanceTo(target);
        const phase = entity._bossPhase ?? 0;
        const phaseMul = this.#phaseBiases[Math.min(phase, this.#phaseBiases.length - 1)];
        // Ideal ranged distance: 8-14 units
        if (dist >= 8 && dist <= 14)
            return 0.8 * phaseMul;
        // Acceptable range: 5-16
        if (dist >= 5 && dist <= 16)
            return 0.5 * phaseMul;
        // Too close or too far
        return 0.1 * phaseMul;
    }
    setGoal(owner: GameEntity): void {
        const entity = owner as BossEntity;
        entity._brain?.clearSubgoals();
        entity._activeBehavior = 'ranged-barrage';
    }
}
/**
 * All-out melee when health is critically low (< 20%). Overrides all other
 * evaluators in desperation. High in phase 3.
 */
export class EnrageEvaluator extends GoalEvaluator {
    #phaseBiases;
    constructor(characterBias: number, phaseBiases = [0.0, 0.2, 1.0]) {
        super(characterBias);
        this.#phaseBiases = phaseBiases;
    }
    calculateDesirability(owner: GameEntity): number {
        const entity = owner as BossEntity;
        const healthPct = entity._healthPct ?? 1;
        const phase = entity._bossPhase ?? 0;
        const phaseMul = this.#phaseBiases[Math.min(phase, this.#phaseBiases.length - 1)];
        // Enrage kicks in at low health
        if (healthPct < 0.15)
            return 0.95 * phaseMul;
        if (healthPct < 0.25)
            return 0.7 * phaseMul;
        if (healthPct < 0.4)
            return 0.3 * phaseMul;
        return 0;
    }
    setGoal(owner: GameEntity): void {
        const entity = owner as BossEntity;
        entity._brain?.clearSubgoals();
        entity._activeBehavior = 'enrage';
    }
}
// ─── Boss brain — phase-aware Think ──────────────────────────────────────────
/**
 * Phase-aware boss brain that switches evaluator biases at health thresholds.
 *
 * Usage:
 * ```typescript
 * const brain = createBossBrain(bossVehicle, bossConfig.phases);
 * // Each frame:
 * brain.updatePhase(currentHealthPct);
 * brain.execute();
 * ```
 */
export class BossBrain extends Think {
    readonly phases: ReadonlyArray<BossPhaseConfig>;
    #currentPhase = 0;
    #phaseChangeCallbacks: Array<(phase: number) => void> = [];
    constructor(owner: GameEntity, phases: readonly BossPhaseConfig[]) {
        super(owner);
        this.phases = phases;
        const entity = owner as BossEntity;
        entity._brain = this;
        entity._bossPhase = 0;
        // Determine boss archetype from attack types to configure evaluator biases
        const hasSummon = phases.some((p) => p.attacks.some((a) => a.type === 'summon'));
        const hasRanged = phases.some((p) => p.attacks.some((a) => a.type === 'ranged'));
        const meleeHeavy = phases[0].attacks.filter((a) => a.type === 'melee').length >=
            phases[0].attacks.filter((a) => a.type !== 'melee').length;
        // Evaluator biases tuned per-archetype
        // Circle strafe: high in phase 1, drops off
        this.addEvaluator(new CircleStrafeEvaluator(0.7, [1.0, 0.4, 0.1]));
        // Aggressive chase: low early, peaks in phase 3
        this.addEvaluator(new AggressiveChaseEvaluator(meleeHeavy ? 0.9 : 0.6, [0.3, 0.7, 0.9]));
        // Retreat + summon: only meaningful if boss has summon attacks
        if (hasSummon) {
            this.addEvaluator(new RetreatAndSummonEvaluator(0.8, [0.1, 0.8, 0.5]));
        }
        // Ranged barrage: only if boss has ranged attacks
        if (hasRanged) {
            this.addEvaluator(new RangedBarrageEvaluator(0.7, [0.6, 0.5, 0.3]));
        }
        // Enrage: always present, only activates at low health in late phases
        this.addEvaluator(new EnrageEvaluator(1.0, [0.0, 0.2, 1.0]));
    }
    /** Register a callback for phase change events. */
    onPhaseChange(cb: (phase: number) => void): void {
        this.#phaseChangeCallbacks.push(cb);
    }
    /** Current phase index (0-based). */
    get currentPhase() {
        return this.#currentPhase;
    }
    /**
     * Call each frame with current health percentage [0, 1].
     * Checks all phase thresholds and advances to the deepest matching phase.
     * Phases are sorted by healthThreshold descending (1.0, 0.66, 0.33).
     */
    updatePhase(healthPct: number): void {
        const owner = this.owner as BossEntity;
        owner._healthPct = healthPct;
        // Phase index 0 = full health, index N = lowest health.
        // Iterate backwards to find the deepest threshold the boss has crossed.
        for (let i = this.phases.length - 1; i >= 0; i--) {
            if (healthPct <= this.phases[i].healthThreshold) {
                if (i > this.#currentPhase) {
                    this.#currentPhase = i;
                    owner._bossPhase = i;
                    // Force re-arbitration on phase change
                    this.status = Goal.STATUS.INACTIVE;
                    for (const cb of this.#phaseChangeCallbacks) {
                        cb(i);
                    }
                }
                break;
            }
        }
    }
    /**
     * Get the currently active behavior tag on the owner entity.
     * Returns the behavior string set by the winning evaluator's setGoal().
     */
    getActiveBehavior(): BossBehavior | undefined {
        return (this.owner as BossEntity | null)?._activeBehavior;
    }
}
/** Create a phase-aware BossBrain for the given entity and phase configuration. */
export function createBossBrain(
    entity: GameEntity,
    phases: readonly BossPhaseConfig[],
): BossBrain {
    return new BossBrain(entity, phases);
}
