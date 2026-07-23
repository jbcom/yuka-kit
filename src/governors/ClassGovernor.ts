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

const observation = (owner: GovernorOwner): GovernorObservation => {
    if (!owner.observation) throw new Error('Governor observation has not been supplied');
    return owner.observation;
};

const nearestEnemy = (state: GovernorObservation): GovernorEnemyObservation | undefined =>
    state.enemies
        .filter((enemy) => enemy.hp > 0)
        .reduce<GovernorEnemyObservation | undefined>((nearest, enemy) => {
            if (!nearest) return enemy;
            return planarDistance(state.actor.position, enemy.position) < planarDistance(state.actor.position, nearest.position)
                ? enemy
                : nearest;
        }, undefined);

const nearestTelegraphingEnemy = (
    state: GovernorObservation,
    range: number,
): GovernorEnemyObservation | undefined =>
    state.enemies
        .filter((enemy) =>
            enemy.hp > 0
            && enemy.telegraphing === true
            && planarDistance(state.actor.position, enemy.position) <= range,
        )
        .reduce<GovernorEnemyObservation | undefined>((nearest, enemy) => {
            if (!nearest) return enemy;
            return planarDistance(state.actor.position, enemy.position) < planarDistance(state.actor.position, nearest.position)
                ? enemy
                : nearest;
        }, undefined);

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

/** Actual Yuka GoalEvaluator/Think brain for deterministic class playthroughs. */
export class ClassGovernor {
    readonly brain: Think;
    readonly #owner = new GameEntity() as GovernorOwner;
    readonly #className: GovernorClass;
    readonly #actions: GovernorActions;
    readonly #healThreshold: number;
    readonly #interactionRadius: number;

    constructor(options: ClassGovernorOptions) {
        this.#className = options.className;
        this.#actions = { ...DEFAULT_ACTIONS, ...options.actions };
        this.#healThreshold = Math.min(1, Math.max(0, options.healThreshold ?? 0.3));
        this.#interactionRadius = Math.max(0.1, options.interactionRadius ?? 1.25);
        this.#owner.governorClass = this.#className;
        this.brain = new Think(this.#owner);

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
            (owner) => this.#survivalIntent(observation(owner)),
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'interact',
            (owner) => {
                const state = observation(owner);
                if (!state.interactable) return 0;
                const enemy = nearestEnemy(state);
                if (enemy && planarDistance(state.actor.position, enemy.position) < 8) return 0;
                const radius = state.interactable.radius ?? this.#interactionRadius;
                return planarDistance(state.actor.position, state.interactable.position) <= radius ? 0.9 : 0;
            },
            (owner) => {
                const target = observation(owner).interactable!;
                return { kind: 'action', action: target.action, payload: target.payload ?? { targetId: target.id } };
            },
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'combat',
            (owner) => nearestEnemy(observation(owner)) ? 0.75 : 0,
            (owner) => this.#combatIntent(observation(owner)),
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'objective',
            (owner) => observation(owner).objective ? 0.5 : 0,
            (owner) => {
                const state = observation(owner);
                const objective = state.objective!;
                const radius = objective.arrivalRadius ?? this.#interactionRadius;
                if (planarDistance(state.actor.position, objective.position) > radius) {
                    return movementAvailable(state)
                        ? { kind: 'move-to', target: objective.position }
                        : { kind: 'wait' };
                }
                return objective.action
                    ? { kind: 'action', action: objective.action, payload: objective.payload ?? { targetId: objective.id } }
                    : { kind: 'stop' };
            },
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'explore',
            (owner) => observation(owner).explorationTargets?.length ? 0.35 : 0,
            (owner) => {
                const state = observation(owner);
                return movementAvailable(state)
                    ? { kind: 'move-to', target: state.explorationTargets![0] }
                    : { kind: 'wait' };
            },
        ));

        this.brain.addEvaluator(new GovernorEvaluator(
            'idle',
            () => 0.01,
            () => ({ kind: 'stop' }),
        ));
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

    #survivalIntent(state: GovernorObservation): AgentIntent {
        if (state.actor.healAvailable && actionReady(state, 'heal')) {
            return actionIntent(this.#actions.heal);
        }

        const enemy = nearestEnemy(state);
        const knightThreat = nearestTelegraphingEnemy(state, 2.5);
        if (this.#className === 'knight' && state.actor.guarding) {
            if (knightThreat) return { kind: 'wait', reason: 'hold-guard-through-telegraph' };
            return actionReady(state, 'knightUnblock')
                ? actionIntent(this.#actions.knightUnblock)
                : { kind: 'wait' };
        }
        if (this.#className === 'knight' && knightThreat && actionReady(state, 'knightBlock')) {
            return actionIntent(this.#actions.knightBlock, targetPayload(knightThreat));
        }
        const hunterThreat = nearestTelegraphingEnemy(state, 3);
        if (
            this.#className === 'hunter'
            && hunterThreat
            && hasAbility(state, 'hunter-roll')
            && actionReady(state, 'hunterRoll')
        ) {
            return actionIntent(this.#actions.hunterRoll);
        }
        const mageThreat = nearestTelegraphingEnemy(state, 5);
        if (
            this.#className === 'mage'
            && mageThreat
            && hasAbility(state, 'mage-ward')
            && actionReady(state, 'mageWard')
        ) {
            return actionIntent(this.#actions.mageWard);
        }

        const recovery = state.recovery;
        if (recovery) {
            const radius = recovery.arrivalRadius ?? this.#interactionRadius;
            if (planarDistance(state.actor.position, recovery.position) > radius) {
                return movementAvailable(state)
                    ? { kind: 'move-to', target: recovery.position }
                    : { kind: 'wait' };
            }
            return recovery.action
                ? { kind: 'action', action: recovery.action, payload: recovery.payload ?? { targetId: recovery.id } }
                : { kind: 'stop' };
        }

        return enemy && movementAvailable(state)
            ? { kind: 'move-away', from: enemy.position }
            : { kind: 'wait' };
    }

    #combatIntent(state: GovernorObservation): AgentIntent {
        const target = nearestEnemy(state);
        if (!target) return { kind: 'stop' };
        const distance = planarDistance(state.actor.position, target.position);

        switch (this.#className) {
            case 'knight': {
                const telegraphingEnemy = nearestTelegraphingEnemy(state, 2.5);
                if (state.actor.guarding) {
                    if (telegraphingEnemy) return { kind: 'wait', reason: 'hold-guard-through-telegraph' };
                    return actionReady(state, 'knightUnblock')
                        ? actionIntent(this.#actions.knightUnblock)
                        : { kind: 'wait' };
                }
                if (telegraphingEnemy && actionReady(state, 'knightBlock')) {
                    return actionIntent(this.#actions.knightBlock, targetPayload(telegraphingEnemy));
                }
                if (
                    (target.clusterSize ?? state.enemies.length) >= 3
                    && state.actor.resource >= 20
                    && hasAbility(state, 'knight-area')
                    && actionReady(state, 'knightArea')
                ) {
                    return actionIntent(this.#actions.knightArea, targetPayload(target));
                }
                if (
                    distance > 1.6
                    && distance <= 3.5
                    && hasAbility(state, 'knight-rush')
                    && actionReady(state, 'knightRush')
                ) {
                    return actionIntent(this.#actions.knightRush, targetPayload(target));
                }
                return distance > 1.6
                    ? movementAvailable(state)
                        ? { kind: 'move-to', target: target.position, speed: 1.05 }
                        : { kind: 'wait' }
                    : actionReady(state, 'knightStrike')
                        ? actionIntent(this.#actions.knightStrike, targetPayload(target))
                        : { kind: 'wait' };
            }

            case 'hunter':
                if (
                    distance < 3
                    && hasAbility(state, 'hunter-roll')
                    && actionReady(state, 'hunterRoll')
                ) {
                    return actionIntent(this.#actions.hunterRoll);
                }
                if (
                    (target.clusterSize ?? state.enemies.length) >= 3
                    && state.actor.abilities?.has('trap')
                    && actionReady(state, 'hunterTrap')
                ) {
                    return actionIntent(this.#actions.hunterTrap, targetPayload(target));
                }
                if (distance < 4) return movementAvailable(state)
                    ? { kind: 'move-away', from: target.position, speed: 1.15 }
                    : { kind: 'wait' };
                if (distance > 8 || target.lineOfSight === false) return movementAvailable(state)
                    ? { kind: 'move-to', target: target.position }
                    : { kind: 'wait' };
                if (
                    target.maxHp >= 180
                    && state.actor.resource >= 30
                    && hasAbility(state, 'hunter-rite')
                    && actionReady(state, 'hunterRite')
                ) {
                    return actionIntent(this.#actions.hunterRite, targetPayload(target));
                }
                return actionReady(state, 'hunterShot')
                    ? actionIntent(this.#actions.hunterShot, targetPayload(target))
                    : { kind: 'wait' };

            case 'mage':
                const telegraphingEnemy = nearestTelegraphingEnemy(state, 5);
                if (
                    telegraphingEnemy
                    && hasAbility(state, 'mage-ward')
                    && actionReady(state, 'mageWard')
                ) {
                    return actionIntent(this.#actions.mageWard);
                }
                if (distance < 3 && state.actor.abilities?.has('blink') && actionReady(state, 'mageBlink')) {
                    return actionIntent(this.#actions.mageBlink, targetPayload(target));
                }
                if (
                    (target.clusterSize ?? state.enemies.length) >= 3
                    && state.actor.resource >= 25
                    && actionReady(state, 'mageArea')
                ) {
                    return actionIntent(this.#actions.mageArea, targetPayload(target));
                }
                if (distance > 9 || target.lineOfSight === false) return movementAvailable(state)
                    ? { kind: 'move-to', target: target.position }
                    : { kind: 'wait' };
                if (state.actor.resource >= 8 && actionReady(state, 'mageBolt')) {
                    return actionIntent(this.#actions.mageBolt, targetPayload(target));
                }
                return movementAvailable(state)
                    ? { kind: 'move-away', from: target.position }
                    : { kind: 'wait' };
        }
    }
}

export const createClassGovernor = (options: ClassGovernorOptions): ClassGovernor => new ClassGovernor(options);
