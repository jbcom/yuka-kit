import { CompositeGoal, Goal, GoalEvaluator, type GameEntity, type Think } from 'yuka';
import type { AIEntity } from '../goals/AIEntity.js';
import {
    requireIntegerInRange,
    requireNonEmptyString,
    validateClosedSnapshotRecord,
    validateSnapshotArray,
} from '../persistence/snapshotValidation.js';
import { planGoap, type GoapPlanResult } from './planner.js';
import type { GoapActionDefinition, GoapActionRegistry } from './registry.js';
import {
    assertGoapConditions,
    satisfiesGoapConditions,
    type GoapConditions,
    type GoapWorldState,
} from './worldState.js';

export interface GoapPlanGoalOptions<Owner extends GameEntity = GameEntity> {
    /** Stable id for this goal: used by snapshots, Intent traits, and evaluator de-duplication. */
    readonly goalId: string;
    /** The conditions the plan must make true. */
    readonly goal: GoapConditions;
    readonly registry: GoapActionRegistry<Owner>;
    /** Read the owner's current world state. Called when planning and before each step. */
    readonly sense: (owner: Owner) => GoapWorldState;
    readonly maxExpansions?: number;
    /** Replans allowed after the first plan before the goal fails (default 3). */
    readonly maxReplans?: number;
}

export interface GoapPlanFailure {
    /** `replan-limit`: steps kept failing or going stale more than `maxReplans` times. */
    readonly reason: 'unreachable' | 'expansion-limit' | 'replan-limit';
    readonly expanded: number;
}

export type GoapPlanStatus = 'inactive' | 'active' | 'completed' | 'failed';

export interface GoapPlanSnapshot {
    schema: 'arcade-ai-yuka-goap-plan';
    version: 1;
    goalId: string;
    /** Action ids, in execution order. Empty before the first plan. */
    plan: string[];
    /** Index of the step in progress; equals `plan.length` once every step completed. */
    step: number;
    replans: number;
    status: GoapPlanStatus;
}

export const DEFAULT_GOAP_MAX_REPLANS = 3;
export const GOAP_PLAN_SNAPSHOT_STEP_LIMIT = 1024;
const MAX_REPLANS_LIMIT = 1_000_000;
const STATUSES: readonly GoapPlanStatus[] = ['inactive', 'active', 'completed', 'failed'];

function validatePlanGoalOptions<Owner extends GameEntity>(options: GoapPlanGoalOptions<Owner>): number {
    requireNonEmptyString(options.goalId, 'GOAP goalId');
    assertGoapConditions(options.goal, `GOAP goal ${options.goalId}`);
    if (typeof options.sense !== 'function') throw new TypeError('GOAP sense must be a function');
    if (typeof options.registry?.actionsFor !== 'function') {
        throw new TypeError('GOAP registry must be a GoapActionRegistry');
    }
    return requireIntegerInRange(
        options.maxReplans ?? DEFAULT_GOAP_MAX_REPLANS, 0, MAX_REPLANS_LIMIT, 'GOAP maxReplans',
    );
}

function planFor<Owner extends GameEntity>(
    owner: Owner,
    options: GoapPlanGoalOptions<Owner>,
): GoapPlanResult<GoapActionDefinition<Owner>> {
    return planGoap(options.sense(owner), options.goal, options.registry.actionsFor(owner), {
        maxExpansions: options.maxExpansions,
    });
}

/**
 * A Yuka composite goal that plans with GOAP on activation and runs the plan
 * one action goal at a time. Before each step it senses again and replans
 * when the step's preconditions or `isAvailable` no longer hold, or when the
 * step fails; after the last step it confirms the goal holds.
 */
export class GoapPlanGoal<Owner extends GameEntity = GameEntity> extends CompositeGoal {
    readonly goalId: string;
    readonly #options: GoapPlanGoalOptions<Owner>;
    readonly #maxReplans: number;
    #plan: readonly GoapActionDefinition<Owner>[] | null = null;
    #step = 0;
    #replans = 0;
    #lastFailure: GoapPlanFailure | null = null;

    constructor(
        owner: Owner,
        options: GoapPlanGoalOptions<Owner>,
        initialPlan?: readonly GoapActionDefinition<Owner>[],
    ) {
        super(owner);
        this.#maxReplans = validatePlanGoalOptions(options);
        this.goalId = options.goalId;
        this.#options = options;
        if (initialPlan !== undefined) this.#plan = [...initialPlan];
    }

    /** Action ids of the current plan (empty before planning or after failure). */
    get plan(): readonly string[] {
        return (this.#plan ?? []).map((action) => action.id);
    }

    get step(): number {
        return this.#step;
    }

    /** The action now running, or `null` when none is. */
    get currentActionId(): string | null {
        if (!this.active() || this.#plan === null) return null;
        return this.#plan[this.#step]?.id ?? null;
    }

    get replans(): number {
        return this.#replans;
    }

    /** Why the goal last failed to plan, or `null`. */
    get lastFailure(): GoapPlanFailure | null {
        return this.#lastFailure;
    }

    get #owner(): Owner {
        return this.owner as Owner;
    }

    activate(): void {
        this.clearSubgoals();
        if (this.#plan === null) {
            this.#replans = 0;
            if (!this.#makePlan()) return;
        }
        this.#beginStep();
    }

    execute(): void {
        this.activateIfInactive();
        if (!this.active()) return;
        const subgoal = this.currentSubgoal() as Goal;
        subgoal.activateIfInactive();
        subgoal.execute();
        if (subgoal.completed()) {
            this.#retire(subgoal);
            this.#step += 1;
            this.#beginStep();
        } else if (subgoal.failed()) {
            this.#retire(subgoal);
            this.#replan();
        }
    }

    /** Retire a finished step goal exactly as Yuka's executeSubgoals does. */
    #retire(subgoal: Goal): void {
        if (subgoal instanceof CompositeGoal) subgoal.clearSubgoals();
        subgoal.terminate();
        this.removeSubgoal(subgoal);
    }

    terminate(): void {
        this.clearSubgoals();
    }

    /** Capture plan progress as a closed, JSON-safe snapshot. */
    snapshot(): GoapPlanSnapshot {
        return {
            schema: 'arcade-ai-yuka-goap-plan',
            version: 1,
            goalId: this.goalId,
            plan: [...this.plan],
            step: this.#step,
            replans: this.#replans,
            status: this.status as GoapPlanStatus,
        };
    }

    /**
     * Restore validated progress. Rejects a different `goalId`, unknown action
     * ids, an out-of-range step, or too many replans before changing anything.
     * The only game code it runs is `terminate()` on a step goal already in
     * flight; it never calls `sense`, `createGoal`, or `isAvailable`. An active
     * plan resumes at its saved step, with a fresh Yuka goal for that step, on
     * the next update.
     */
    restore(snapshot: unknown): void {
        const validated = validateGoapPlanSnapshot(snapshot);
        if (validated.goalId !== this.goalId) {
            throw new TypeError(`GOAP snapshot is for goal ${validated.goalId}, not ${this.goalId}`);
        }
        const plan = validated.plan.map((id) => {
            const action = this.#options.registry.get(id);
            if (!action) throw new TypeError(`GOAP snapshot references unknown action: ${id}`);
            return action;
        });
        if (validated.replans > this.#maxReplans) {
            throw new TypeError(`GOAP snapshot replans exceed maxReplans ${this.#maxReplans}`);
        }
        const resumable = validated.status === 'active' || validated.status === 'inactive';
        if (resumable && plan.length > 0 && validated.step >= plan.length) {
            throw new TypeError('GOAP snapshot step has no remaining action to resume');
        }
        this.clearSubgoals();
        this.#plan = plan.length > 0 || validated.status === 'completed' ? plan : null;
        if (validated.status === 'failed') this.#plan = null;
        this.#step = validated.step;
        this.#replans = validated.replans;
        this.#lastFailure = null;
        this.status = resumable ? Goal.STATUS.INACTIVE
            : validated.status === 'completed' ? Goal.STATUS.COMPLETED : Goal.STATUS.FAILED;
    }

    #makePlan(): boolean {
        const result = planFor(this.#owner, this.#options);
        if (!result.found) {
            this.#fail({ reason: result.reason, expanded: result.expanded });
            return false;
        }
        this.#plan = result.actions;
        this.#step = 0;
        this.#lastFailure = null;
        if (result.actions.length === 0) {
            this.status = Goal.STATUS.COMPLETED;
            return false;
        }
        return true;
    }

    #beginStep(): void {
        const plan = this.#plan as readonly GoapActionDefinition<Owner>[];
        const owner = this.#owner;
        const state = this.#options.sense(owner);
        if (this.#step >= plan.length) {
            if (satisfiesGoapConditions(state, this.#options.goal)) {
                this.status = Goal.STATUS.COMPLETED;
            } else {
                this.#replan();
            }
            return;
        }
        const action = plan[this.#step] as GoapActionDefinition<Owner>;
        const stillRegistered = this.#options.registry.get(action.id) === action;
        if (
            !stillRegistered
            || !satisfiesGoapConditions(state, action.preconditions)
            || !(action.isAvailable?.(owner) ?? true)
        ) {
            this.#replan();
            return;
        }
        this.addSubgoal(action.createGoal(owner));
    }

    #replan(): void {
        if (this.#replans >= this.#maxReplans) {
            this.#fail({ reason: 'replan-limit', expanded: 0 });
            return;
        }
        this.#replans += 1;
        if (this.#makePlan()) this.#beginStep();
    }

    #fail(failure: GoapPlanFailure): void {
        this.clearSubgoals();
        this.#plan = null;
        this.#step = 0; // keep snapshot() of a failed goal valid: no plan, no step
        this.#lastFailure = failure;
        this.status = Goal.STATUS.FAILED;
    }
}

/** Validate and normalize an untrusted GOAP plan snapshot without touching a goal. */
export function validateGoapPlanSnapshot(snapshot: unknown): GoapPlanSnapshot {
    const record = validateClosedSnapshotRecord(
        snapshot,
        ['schema', 'version', 'goalId', 'plan', 'step', 'replans', 'status'],
        [],
        'GOAP plan snapshot',
    );
    if (record.schema !== 'arcade-ai-yuka-goap-plan' || record.version !== 1) {
        throw new TypeError('Unsupported GOAP plan snapshot');
    }
    const plan = validateSnapshotArray(record.plan, 'GOAP plan snapshot plan', GOAP_PLAN_SNAPSHOT_STEP_LIMIT)
        .map((id, index) => requireNonEmptyString(id, `GOAP plan snapshot plan[${index}]`));
    const status = record.status as GoapPlanStatus;
    if (!STATUSES.includes(status)) {
        throw new TypeError('GOAP plan snapshot status must be inactive, active, completed, or failed');
    }
    return {
        schema: 'arcade-ai-yuka-goap-plan',
        version: 1,
        goalId: requireNonEmptyString(record.goalId, 'GOAP plan snapshot goalId'),
        plan,
        step: requireIntegerInRange(record.step, 0, plan.length, 'GOAP plan snapshot step'),
        replans: requireIntegerInRange(record.replans, 0, MAX_REPLANS_LIMIT, 'GOAP plan snapshot replans'),
        status,
    };
}

export interface GoapGoalEvaluatorOptions<Owner extends GameEntity = GameEntity>
    extends GoapPlanGoalOptions<Owner> {
    /** Raw desirability before `characterBias`; must be finite. */
    readonly desirability: (owner: Owner) => number;
    readonly characterBias?: number;
    /** Score 0 when no plan exists (default true), so Think never picks an impossible goal. */
    readonly requirePlan?: boolean;
    /** Find the owner's brain. Defaults to the `_brain` tag set by `createBrain`. */
    readonly brain?: (owner: Owner) => Think | undefined;
}

/**
 * Yuka `GoalEvaluator` that scores a GOAP goal and, when `Think` picks it,
 * installs a `GoapPlanGoal` with the plan found while scoring. Picking the
 * same `goalId` while it is still running keeps the running plan.
 */
export class GoapGoalEvaluator<Owner extends GameEntity = GameEntity> extends GoalEvaluator {
    readonly goalId: string;
    readonly #options: GoapGoalEvaluatorOptions<Owner>;
    #pending: { owner: Owner; plan: readonly GoapActionDefinition<Owner>[] } | null = null;

    constructor(options: GoapGoalEvaluatorOptions<Owner>) {
        super(options.characterBias ?? 1);
        validatePlanGoalOptions(options);
        if (typeof options.desirability !== 'function') {
            throw new TypeError('GOAP desirability must be a function');
        }
        this.goalId = options.goalId;
        this.#options = options;
    }

    calculateDesirability(owner: GameEntity): number {
        const agent = owner as Owner;
        this.#pending = null;
        const raw = this.#options.desirability(agent);
        if (!Number.isFinite(raw)) {
            throw new TypeError(`GOAP desirability for ${this.goalId} must be finite; received ${String(raw)}`);
        }
        // Think.arbitrate multiplies by characterBias itself; a zero bias means
        // this goal can never win, so skip planning for it as for a zero score.
        if (raw <= 0 || this.characterBias <= 0 || this.#options.requirePlan === false || this.#running(agent)) {
            return raw;
        }
        const result = planFor(agent, this.#options);
        if (!result.found) return 0;
        this.#pending = { owner: agent, plan: result.actions };
        return raw;
    }

    setGoal(owner: GameEntity): void {
        const agent = owner as Owner;
        const brain = this.#brainOf(agent);
        if (!brain) {
            throw new TypeError('GoapGoalEvaluator needs a Think brain: use createBrain or pass options.brain');
        }
        if (this.#running(agent)) return;
        const plan = this.#pending?.owner === agent ? this.#pending.plan : undefined;
        this.#pending = null;
        brain.clearSubgoals();
        brain.addSubgoal(new GoapPlanGoal(agent, this.#options, plan));
    }

    #brainOf(owner: Owner): Think | undefined {
        return this.#options.brain ? this.#options.brain(owner) : (owner as AIEntity)._brain;
    }

    #running(owner: Owner): boolean {
        const current = this.#brainOf(owner)?.currentSubgoal();
        return current instanceof GoapPlanGoal
            && current.goalId === this.goalId
            && !current.completed()
            && !current.failed();
    }
}
