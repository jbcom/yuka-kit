import { GameEntity, GoalEvaluator, Think, Vector3, type GameEntity as YukaEntity } from 'yuka';
import type { Vec3Like } from '../core/types.js';
import { setTargetPosition } from '../goals/AIEntity.js';
import { createBossBrain, type BossBehavior, type BossPhaseConfig } from '../goals/bossBrain.js';
import type { AgentIntent } from '../intents.js';

export type CombatTactic = 'melee' | 'ranged' | 'charge' | 'ambush';

export type TacticalCombatBehavior =
    | 'dormant'
    | 'approach'
    | 'retreat'
    | 'attack'
    | 'charge'
    | 'flee'
    | 'hold';

export interface TacticalCombatObservation {
    position: Vec3Like;
    target: Vec3Like;
    targetId?: string;
    healthPct: number;
    targetVisible?: boolean;
    alerted?: boolean;
    attackReady?: boolean;
    chargeReady?: boolean;
}

export interface TacticalCombatDecision {
    tactic: CombatTactic;
    behavior: TacticalCombatBehavior;
    distance: number;
    intent: AgentIntent;
}

export interface TacticalCombatAgentOptions {
    tactic: CombatTactic;
    detectionRange: number;
    attackRange: number;
    preferredRange?: number;
    retreatHealthPct?: number;
    moveSpeed?: number;
    attackIntent?: (observation: TacticalCombatObservation) => AgentIntent;
    chargeIntent?: (observation: TacticalCombatObservation) => AgentIntent;
}

interface TacticalOwner extends YukaEntity {
    tactical?: {
        observation: TacticalCombatObservation;
        distance: number;
        engaged: boolean;
    };
    tacticalDecision?: TacticalCombatDecision;
}

const planarDistance = (left: Vec3Like, right: Vec3Like): number =>
    Math.hypot(left.x - right.x, left.z - right.z);

const assertPositive = (value: number, label: string): number => {
    if (!Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive finite number`);
    }
    return value;
};

const assertHealthPct = (value: number): number => {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new TypeError('healthPct must be between 0 and 1');
    }
    return value;
};

const context = (owner: TacticalOwner): NonNullable<TacticalOwner['tactical']> => {
    if (!owner.tactical) throw new Error('Tactical combat context has not been supplied');
    return owner.tactical;
};

class TacticalEvaluator extends GoalEvaluator {
    readonly #score: (owner: TacticalOwner) => number;
    readonly #decide: (owner: TacticalOwner) => TacticalCombatDecision;

    constructor(
        score: (owner: TacticalOwner) => number,
        decide: (owner: TacticalOwner) => TacticalCombatDecision,
    ) {
        super(1);
        this.#score = score;
        this.#decide = decide;
    }

    calculateDesirability(owner: YukaEntity): number {
        return this.#score(owner as TacticalOwner);
    }

    setGoal(owner: YukaEntity): void {
        const tacticalOwner = owner as TacticalOwner;
        tacticalOwner.tacticalDecision = this.#decide(tacticalOwner);
    }
}

/**
 * Yuka-arbitrated combat tactics extracted from the fleet's authored enemy
 * loops. The package decides behavior and returns a command-neutral intent;
 * games retain their own actions, damage, content, and authoritative runtime.
 */
export class TacticalCombatAgent {
    readonly brain: Think;
    readonly #owner = new GameEntity() as TacticalOwner;
    readonly #options: Required<
        Pick<
            TacticalCombatAgentOptions,
            'tactic' | 'detectionRange' | 'attackRange' | 'preferredRange' | 'retreatHealthPct'
        >
    > &
        Pick<TacticalCombatAgentOptions, 'moveSpeed' | 'attackIntent' | 'chargeIntent'>;

    constructor(options: TacticalCombatAgentOptions) {
        const attackRange = assertPositive(options.attackRange, 'attackRange');
        const moveSpeed = options.moveSpeed === undefined
            ? undefined
            : assertPositive(options.moveSpeed, 'moveSpeed');
        this.#options = {
            ...options,
            detectionRange: assertPositive(options.detectionRange, 'detectionRange'),
            attackRange,
            preferredRange: assertPositive(options.preferredRange ?? attackRange, 'preferredRange'),
            retreatHealthPct: Math.min(1, Math.max(0, options.retreatHealthPct ?? 0)),
            moveSpeed,
        };

        this.brain = new Think(this.#owner);
        this.brain.addEvaluator(
            new TacticalEvaluator(
                (owner) => {
                    const threshold = this.#options.retreatHealthPct;
                    return threshold > 0 && context(owner).observation.healthPct <= threshold ? 1 : 0;
                },
                (owner) => this.decision(owner, 'flee', {
                    kind: 'move-away',
                    from: context(owner).observation.target,
                    speed: this.#options.moveSpeed,
                }),
            ),
        );
        this.brain.addEvaluator(
            new TacticalEvaluator(
                (owner) => (context(owner).engaged ? 0 : 0.99),
                (owner) => this.decision(owner, 'dormant', { kind: 'wait', reason: 'target-unseen' }),
            ),
        );
        this.brain.addEvaluator(
            new TacticalEvaluator(
                (owner) => {
                    const state = context(owner);
                    return this.#options.tactic === 'charge' &&
                        state.observation.chargeReady !== false &&
                        state.distance > this.#options.attackRange &&
                        state.distance <= this.#options.preferredRange
                        ? 0.95
                        : 0;
                },
                (owner) => this.decision(
                    owner,
                    'charge',
                    this.#options.chargeIntent?.(context(owner).observation) ?? {
                        kind: 'action',
                        action: 'charge',
                        payload: context(owner).observation.targetId,
                    },
                ),
            ),
        );
        this.brain.addEvaluator(
            new TacticalEvaluator(
                (owner) => {
                    const state = context(owner);
                    return this.#options.tactic === 'ranged' &&
                        state.distance < this.#options.preferredRange * 0.7
                        ? 0.92
                        : 0;
                },
                (owner) => this.decision(owner, 'retreat', {
                    kind: 'move-away',
                    from: context(owner).observation.target,
                    speed: this.#options.moveSpeed,
                }),
            ),
        );
        this.brain.addEvaluator(
            new TacticalEvaluator(
                (owner) => {
                    const state = context(owner);
                    if (state.observation.attackReady === false || state.distance > this.#options.attackRange) {
                        return 0;
                    }
                    if (
                        this.#options.tactic === 'ranged' &&
                        state.distance < this.#options.preferredRange * 0.7
                    ) {
                        return 0;
                    }
                    return 0.9;
                },
                (owner) => this.decision(
                    owner,
                    'attack',
                    this.#options.attackIntent?.(context(owner).observation) ?? {
                        kind: 'action',
                        action: 'attack',
                        payload: context(owner).observation.targetId,
                    },
                ),
            ),
        );
        this.brain.addEvaluator(
            new TacticalEvaluator(
                (owner) => {
                    const state = context(owner);
                    if (!state.engaged) return 0;
                    return state.distance > this.#options.attackRange ? 0.7 : 0;
                },
                (owner) => this.decision(owner, 'approach', {
                    kind: 'move-to',
                    target: context(owner).observation.target,
                    speed: this.#options.moveSpeed,
                }),
            ),
        );
        this.brain.addEvaluator(
            new TacticalEvaluator(
                () => 0.01,
                (owner) => this.decision(owner, 'hold', { kind: 'wait', reason: 'combat-hold' }),
            ),
        );
    }

    decide(observation: TacticalCombatObservation): TacticalCombatDecision {
        assertHealthPct(observation.healthPct);
        const distance = planarDistance(observation.position, observation.target);
        const targetVisible = observation.targetVisible ?? true;
        const engaged = observation.alerted === true ||
            (targetVisible && distance <= this.#options.detectionRange);
        this.#owner.position.set(observation.position.x, observation.position.y, observation.position.z);
        this.#owner.tactical = { observation, distance, engaged };
        this.#owner.tacticalDecision = undefined;
        this.brain.arbitrate();
        if (!this.#owner.tacticalDecision) {
            throw new Error('Yuka tactical arbitration produced no decision');
        }
        return this.#owner.tacticalDecision;
    }

    private decision(
        owner: TacticalOwner,
        behavior: TacticalCombatBehavior,
        intent: AgentIntent,
    ): TacticalCombatDecision {
        return {
            tactic: this.#options.tactic,
            behavior,
            distance: context(owner).distance,
            intent,
        };
    }
}

export interface BossTacticalObservation extends TacticalCombatObservation {
    rangedReady?: boolean;
    summonReady?: boolean;
}

export interface BossTacticalAgentOptions {
    phases: readonly BossPhaseConfig[];
    meleeRange: number;
    rangedRange: number;
    preferredRange: number;
    moveSpeed?: number;
    orbitSign?: -1 | 1;
    meleeIntent?: (observation: BossTacticalObservation) => AgentIntent;
    rangedIntent?: (observation: BossTacticalObservation) => AgentIntent;
    summonIntent?: (observation: BossTacticalObservation) => AgentIntent;
}

export interface BossTacticalDecision {
    behavior: BossBehavior;
    phase: number;
    distance: number;
    intent: AgentIntent;
}

/** Converts the shared phase-aware BossBrain's winning behavior into an intent. */
export class BossTacticalAgent {
    readonly #owner = new GameEntity();
    readonly #target = new Vector3();
    readonly #brain;
    readonly #options: BossTacticalAgentOptions;

    constructor(options: BossTacticalAgentOptions) {
        if (options.phases.length === 0) throw new TypeError('Boss phases are required');
        assertPositive(options.meleeRange, 'meleeRange');
        assertPositive(options.rangedRange, 'rangedRange');
        assertPositive(options.preferredRange, 'preferredRange');
        if (options.moveSpeed !== undefined) assertPositive(options.moveSpeed, 'moveSpeed');
        this.#options = options;
        this.#brain = createBossBrain(this.#owner, options.phases);
    }

    get currentPhase(): number {
        return this.#brain.currentPhase;
    }

    decide(observation: BossTacticalObservation): BossTacticalDecision {
        assertHealthPct(observation.healthPct);
        this.#owner.position.set(observation.position.x, observation.position.y, observation.position.z);
        this.#target.set(observation.target.x, observation.target.y, observation.target.z);
        setTargetPosition(this.#owner, this.#target);
        this.#brain.updatePhase(observation.healthPct);
        this.#brain.arbitrate();
        const behavior = this.#brain.getActiveBehavior();
        if (!behavior) throw new Error('Yuka boss arbitration produced no behavior');
        const distance = planarDistance(observation.position, observation.target);
        return {
            behavior,
            phase: this.#brain.currentPhase,
            distance,
            intent: this.intentFor(behavior, observation, distance),
        };
    }

    private intentFor(
        behavior: BossBehavior,
        observation: BossTacticalObservation,
        distance: number,
    ): AgentIntent {
        const moveSpeed = this.#options.moveSpeed;
        const melee = () => this.#options.meleeIntent?.(observation) ?? {
            kind: 'action' as const,
            action: 'attack',
            payload: observation.targetId,
        };
        if (behavior === 'enrage' || behavior === 'aggressive-chase') {
            return distance <= this.#options.meleeRange && observation.attackReady !== false
                ? melee()
                : { kind: 'move-to', target: observation.target, speed: moveSpeed };
        }
        if (behavior === 'retreat-and-summon') {
            if (observation.summonReady !== false && this.#options.summonIntent) {
                return this.#options.summonIntent(observation);
            }
            return { kind: 'move-away', from: observation.target, speed: moveSpeed };
        }
        if (behavior === 'ranged-barrage') {
            if (distance < this.#options.preferredRange * 0.7) {
                return { kind: 'move-away', from: observation.target, speed: moveSpeed };
            }
            if (distance > this.#options.rangedRange) {
                return { kind: 'move-to', target: observation.target, speed: moveSpeed };
            }
            return observation.rangedReady !== false && this.#options.rangedIntent
                ? this.#options.rangedIntent(observation)
                : { kind: 'wait', reason: 'boss-ranged-cooldown' };
        }
        return {
            kind: 'move-to',
            target: this.orbitTarget(observation),
            speed: moveSpeed,
        };
    }

    private orbitTarget(observation: BossTacticalObservation): Vec3Like {
        const dx = observation.position.x - observation.target.x;
        const dz = observation.position.z - observation.target.z;
        const angle = (this.#options.orbitSign ?? 1) * (Math.PI / 4);
        const length = Math.max(0.0001, Math.hypot(dx, dz));
        const nx = dx / length;
        const nz = dz / length;
        return {
            x: observation.target.x +
                (nx * Math.cos(angle) - nz * Math.sin(angle)) * this.#options.preferredRange,
            y: observation.position.y,
            z: observation.target.z +
                (nx * Math.sin(angle) + nz * Math.cos(angle)) * this.#options.preferredRange,
        };
    }
}
