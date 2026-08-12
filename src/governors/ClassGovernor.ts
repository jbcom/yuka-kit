import { GameEntity, GoalEvaluator, Think, type GameEntity as YukaEntity } from 'yuka';
import type { Vec3Like } from '../core/types.js';
import type { AgentIntent } from '../intents.js';
import type {
    ClassGovernorOptions,
    GovernorAction,
    GovernorActionName,
    GovernorActions,
    GovernorClass,
    GovernorDecision,
    GovernorEnemyObservation,
    GovernorObservation,
} from './types.js';

interface GovernorOwner extends YukaEntity {
    observation?: GovernorObservation;
    governorClass?: GovernorClass;
    decision?: GovernorDecision;
}

const DEFAULT_ACTIONS: GovernorActions = {
    heal: 'use-heal',
    knightStrike: 'knight:strike',
    knightBlock: 'knight:block',
    knightUnblock: 'knight:unblock',
    knightRush: 'knight:rush',
    knightArea: 'knight:area',
    hunterShot: 'hunter:shoot',
    hunterTrap: 'hunter:trap',
    hunterRoll: 'hunter:roll',
    hunterRite: 'hunter:rite',
    mageBolt: 'mage:bolt',
    mageArea: 'mage:cast-area',
    mageBlink: 'mage:blink',
    mageWard: 'mage:ward',
};

const planarDistance = (a: Vec3Like, b: Vec3Like): number => Math.hypot(a.x - b.x, a.z - b.z);

interface ScoredEnemy {
    readonly enemy: GovernorEnemyObservation;
    readonly distance: number;
}

interface EnemyScanResult {
    readonly nearest: ScoredEnemy | undefined;
    readonly nearestTelegraph: ScoredEnemy | undefined;
}

const scanEnemies = (state: GovernorObservation, telegraphRange: number): EnemyScanResult => {
    let nearest: ScoredEnemy | undefined;
    let nearestTelegraph: ScoredEnemy | undefined;
    for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        const distance = planarDistance(state.actor.position, enemy.position);
        if (!nearest || distance < nearest.distance) {
            nearest = { enemy, distance };
        }
        if (
            enemy.telegraphing
            && distance <= telegraphRange
            && (!nearestTelegraph || distance < nearestTelegraph.distance)
        ) {
            nearestTelegraph = { enemy, distance };
        }
    }
    return { nearest, nearestTelegraph };
};

const nearestEnemy = (state: GovernorObservation): ScoredEnemy | undefined =>
    scanEnemies(state, Infinity).nearest;

const nearestTelegraphingEnemy = (state: GovernorObservation, range: number): ScoredEnemy | undefined =>
    scanEnemies(state, range).nearestTelegraph;

const observation = (owner: GovernorOwner): GovernorObservation => {
    if (!owner.observation) throw new Error('Governor observation has not been supplied');
    return owner.observation;
};

const targetPayload = (target: GovernorEnemyObservation): { targetId: string } => ({ targetId: target.id });
const actionReady = (state: GovernorObservation, name: GovernorActionName): boolean =>
    state.actor.readyActions?.has(name) ?? true;
const movementAvailable = (state: GovernorObservation): boolean => state.actor.movementAvailable ?? true;
const hasAbility = (state: GovernorObservation, ability: string): boolean =>
    state.actor.abilities?.has(ability) ?? false;

const actionIntent = (
    binding: GovernorAction,
    payload?: Record<string, unknown>,
): AgentIntent => {
    if (typeof binding === 'string') return { kind: 'action', action: binding, payload };
    return {
        kind: 'action',
        action: binding.action,
        payload: { ...(binding.payload ?? {}), ...(payload ?? {}) },
    };
};

const wait = (reason?: string): AgentIntent => ({ kind: 'wait', reason });
const stop = (): AgentIntent => ({ kind: 'stop' });

interface IntentContext {
    readonly state: GovernorObservation;
    readonly actions: GovernorActions;
    readonly interactionRadius: number;
}

const actionOrWait = (
    ctx: IntentContext,
    name: GovernorActionName,
    binding: GovernorAction,
    payload?: Record<string, unknown>,
): AgentIntent => (actionReady(ctx.state, name) ? actionIntent(binding, payload) : wait());

const moveToOrWait = (ctx: IntentContext, target: Vec3Like, speed?: number): AgentIntent =>
    movementAvailable(ctx.state) ? { kind: 'move-to', target, speed } : wait();

const moveAwayOrWait = (ctx: IntentContext, from: Vec3Like, speed?: number): AgentIntent =>
    movementAvailable(ctx.state) ? { kind: 'move-away', from, speed } : wait();

const resolveRecovery = (ctx: IntentContext): AgentIntent => {
    const recovery = ctx.state.recovery!;
    const radius = recovery.arrivalRadius ?? ctx.interactionRadius;
    if (planarDistance(ctx.state.actor.position, recovery.position) > radius) {
        return moveToOrWait(ctx, recovery.position);
    }
    return recovery.action
        ? { kind: 'action', action: recovery.action, payload: recovery.payload ?? { targetId: recovery.id } }
        : stop();
};

const resolveObjective = (ctx: IntentContext): AgentIntent => {
    const objective = ctx.state.objective!;
    const radius = objective.arrivalRadius ?? ctx.interactionRadius;
    if (planarDistance(ctx.state.actor.position, objective.position) > radius) {
        return moveToOrWait(ctx, objective.position);
    }
    return objective.action
        ? { kind: 'action', action: objective.action, payload: objective.payload ?? { targetId: objective.id } }
        : stop();
};

const resolveInteractable = (ctx: IntentContext): AgentIntent => {
    const target = ctx.state.interactable!;
    return { kind: 'action', action: target.action, payload: target.payload ?? { targetId: target.id } };
};

interface ClassIntentStrategy {
    survival(ctx: IntentContext, enemy: ScoredEnemy | undefined): AgentIntent | undefined;
    combat(ctx: IntentContext, target: ScoredEnemy): AgentIntent;
}

const KnightStrategy: ClassIntentStrategy = {
    survival(ctx, _enemy) {
        const threat = nearestTelegraphingEnemy(ctx.state, 2.5);
        if (ctx.state.actor.guarding) {
            if (threat) return wait('hold-guard-through-telegraph');
            return actionOrWait(ctx, 'knightUnblock', ctx.actions.knightUnblock);
        }
        if (threat) {
            return actionOrWait(ctx, 'knightBlock', ctx.actions.knightBlock, targetPayload(threat.enemy));
        }
        return undefined;
    },
    combat(ctx, target) {
        const threat = nearestTelegraphingEnemy(ctx.state, 2.5);
        if (ctx.state.actor.guarding) {
            if (threat) return wait('hold-guard-through-telegraph');
            return actionOrWait(ctx, 'knightUnblock', ctx.actions.knightUnblock);
        }
        if (threat) {
            return actionOrWait(ctx, 'knightBlock', ctx.actions.knightBlock, targetPayload(threat.enemy));
        }
        if (
            (target.enemy.clusterSize ?? ctx.state.enemies.length) >= 3
            && ctx.state.actor.resource >= 20
            && hasAbility(ctx.state, 'knight-area')
        ) {
            return actionOrWait(ctx, 'knightArea', ctx.actions.knightArea, targetPayload(target.enemy));
        }
        if (
            target.distance > 1.6
            && target.distance <= 3.5
            && hasAbility(ctx.state, 'knight-rush')
        ) {
            return actionOrWait(ctx, 'knightRush', ctx.actions.knightRush, targetPayload(target.enemy));
        }
        if (target.distance > 1.6) {
            return moveToOrWait(ctx, target.enemy.position, 1.05);
        }
        return actionOrWait(ctx, 'knightStrike', ctx.actions.knightStrike, targetPayload(target.enemy));
    },
};

const HunterStrategy: ClassIntentStrategy = {
    survival(ctx, _enemy) {
        const threat = nearestTelegraphingEnemy(ctx.state, 8);
        if (threat && hasAbility(ctx.state, 'hunter-roll')) {
            return actionOrWait(ctx, 'hunterRoll', ctx.actions.hunterRoll);
        }
        return undefined;
    },
    combat(ctx, target) {
        const threat = nearestTelegraphingEnemy(ctx.state, 8);
        if (threat && hasAbility(ctx.state, 'hunter-roll')) {
            return actionOrWait(ctx, 'hunterRoll', ctx.actions.hunterRoll);
        }
        if (target.distance > 8 || target.enemy.lineOfSight === false) {
            return moveToOrWait(ctx, target.enemy.position);
        }
        if (target.distance < 3 && hasAbility(ctx.state, 'hunter-roll')) {
            return actionOrWait(ctx, 'hunterRoll', ctx.actions.hunterRoll);
        }
        if (
            (target.enemy.clusterSize ?? ctx.state.enemies.length) >= 3
            && hasAbility(ctx.state, 'trap')
        ) {
            return actionOrWait(ctx, 'hunterTrap', ctx.actions.hunterTrap, targetPayload(target.enemy));
        }
        if (target.distance < 4) {
            if (actionReady(ctx.state, 'hunterShot')) {
                return actionIntent(ctx.actions.hunterShot, targetPayload(target.enemy));
            }
            return moveAwayOrWait(ctx, target.enemy.position, 1.15);
        }
        if (
            target.enemy.maxHp >= 180
            && ctx.state.actor.resource >= 30
            && hasAbility(ctx.state, 'hunter-rite')
        ) {
            return actionOrWait(ctx, 'hunterRite', ctx.actions.hunterRite, targetPayload(target.enemy));
        }
        return actionReady(ctx.state, 'hunterShot')
            ? actionIntent(ctx.actions.hunterShot, targetPayload(target.enemy))
            : wait();
    },
};

const MageStrategy: ClassIntentStrategy = {
    survival(ctx, _enemy) {
        const threat = nearestTelegraphingEnemy(ctx.state, 5);
        if (threat && hasAbility(ctx.state, 'mage-ward')) {
            return actionOrWait(ctx, 'mageWard', ctx.actions.mageWard);
        }
        return undefined;
    },
    combat(ctx, target) {
        const threat = nearestTelegraphingEnemy(ctx.state, 5);
        if (threat && hasAbility(ctx.state, 'mage-ward')) {
            return actionOrWait(ctx, 'mageWard', ctx.actions.mageWard);
        }
        if (target.distance < 3 && hasAbility(ctx.state, 'blink')) {
            return actionOrWait(ctx, 'mageBlink', ctx.actions.mageBlink, targetPayload(target.enemy));
        }
        if (
            (target.enemy.clusterSize ?? ctx.state.enemies.length) >= 3
            && ctx.state.actor.resource >= 25
        ) {
            return actionOrWait(ctx, 'mageArea', ctx.actions.mageArea, targetPayload(target.enemy));
        }
        if (target.distance > 9 || target.enemy.lineOfSight === false) {
            return moveToOrWait(ctx, target.enemy.position);
        }
        if (actionReady(ctx.state, 'mageBolt')) {
            return actionIntent(ctx.actions.mageBolt, targetPayload(target.enemy));
        }
        return moveAwayOrWait(ctx, target.enemy.position);
    },
};

const STRATEGIES: Record<GovernorClass, ClassIntentStrategy> = {
    knight: KnightStrategy,
    hunter: HunterStrategy,
    mage: MageStrategy,
};

class GovernorEvaluator extends GoalEvaluator {
    readonly #goal: GovernorDecision['goal'];
    readonly #score: (owner: GovernorOwner) => number;
    readonly #intent: (owner: GovernorOwner) => AgentIntent;

    constructor(
        goal: GovernorDecision['goal'],
        score: (owner: GovernorOwner) => number,
        intent: (owner: GovernorOwner) => AgentIntent,
    ) {
        super(1);
        this.#goal = goal;
        this.#score = score;
        this.#intent = intent;
    }

    calculateDesirability(owner: YukaEntity): number {
        return this.#score(owner as GovernorOwner);
    }

    setGoal(owner: YukaEntity): void {
        const governorOwner = owner as GovernorOwner;
        governorOwner.decision = {
            className: governorOwner.governorClass!,
            goal: this.#goal,
            intent: this.#intent(governorOwner),
        };
    }
}

/** Actual Yuka GoalEvaluator/Think brain for deterministic class playthroughs. */
export class ClassGovernor {
    readonly brain: Think;
    readonly #owner = new GameEntity() as GovernorOwner;
    readonly #className: GovernorClass;
    readonly #actions: GovernorActions;
    readonly #healThreshold: number;
    readonly #interactionRadius: number;
    readonly #strategy: ClassIntentStrategy;

    constructor(options: ClassGovernorOptions) {
        this.#className = options.className;
        this.#actions = { ...DEFAULT_ACTIONS, ...options.actions };
        this.#healThreshold = Math.min(1, Math.max(0, options.healThreshold ?? 0.3));
        this.#interactionRadius = Math.max(0.1, options.interactionRadius ?? 1.25);
        this.#owner.governorClass = this.#className;
        this.brain = new Think(this.#owner);
        this.#strategy = STRATEGIES[this.#className];

        this.brain.addEvaluator(new GovernorEvaluator(
            'survive',
            (owner) => {
                const state = observation(owner);
                const ratio = state.actor.maxHp > 0 ? state.actor.hp / state.actor.maxHp : 0;
                if (ratio <= this.#healThreshold && state.recovery) return 1;
                if (ratio <= this.#healThreshold && state.actor.healAvailable && actionReady(state, 'heal')) return 1;
                if (ratio <= this.#healThreshold * 0.65 && nearestEnemy(state) && movementAvailable(state)) return 0.98;
                return 0;
            },
            (owner) => this.#survivalIntent(this.#makeContext(observation(owner))),
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'interact',
            (owner) => {
                const state = observation(owner);
                if (!state.interactable) return 0;
                const enemy = nearestEnemy(state);
                if (enemy && planarDistance(state.actor.position, enemy.enemy.position) < 8) return 0;
                const radius = state.interactable.radius ?? this.#interactionRadius;
                return planarDistance(state.actor.position, state.interactable.position) <= radius ? 0.9 : 0;
            },
            (owner) => resolveInteractable(this.#makeContext(observation(owner))),
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'combat',
            (owner) => (nearestEnemy(observation(owner)) ? 0.75 : 0),
            (owner) => {
                const ctx = this.#makeContext(observation(owner));
                const target = nearestEnemy(ctx.state);
                if (!target) return stop();
                return this.#strategy.combat(ctx, target);
            },
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'objective',
            (owner) => (observation(owner).objective ? 0.5 : 0),
            (owner) => resolveObjective(this.#makeContext(observation(owner))),
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'explore',
            (owner) => (observation(owner).explorationTargets?.length ? 0.35 : 0),
            (owner) => {
                const ctx = this.#makeContext(observation(owner));
                return moveToOrWait(ctx, ctx.state.explorationTargets![0]);
            },
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'idle',
            () => 0.01,
            () => stop(),
        ));
    }

    #makeContext(state: GovernorObservation): IntentContext {
        return {
            state,
            actions: this.#actions,
            interactionRadius: this.#interactionRadius,
        };
    }

    #survivalIntent(ctx: IntentContext): AgentIntent {
        if (ctx.state.actor.healAvailable && actionReady(ctx.state, 'heal')) {
            return actionIntent(ctx.actions.heal);
        }
        const enemy = nearestEnemy(ctx.state);
        const classIntent = this.#strategy.survival(ctx, enemy);
        if (classIntent) return classIntent;
        if (ctx.state.recovery) return resolveRecovery(ctx);
        return enemy ? moveAwayOrWait(ctx, enemy.enemy.position) : wait();
    }

    decide(state: GovernorObservation): GovernorDecision {
        if (!Number.isFinite(state.actor.hp) || !Number.isFinite(state.actor.maxHp)) {
            throw new TypeError('Governor hit points must be finite');
        }
        this.#owner.observation = state;
        this.#owner.decision = undefined;
        this.brain.arbitrate();
        if (!this.#owner.decision) throw new Error('Yuka governor arbitration produced no decision');
        return this.#owner.decision;
    }
}

export const createClassGovernor = (options: ClassGovernorOptions): ClassGovernor => new ClassGovernor(options);
