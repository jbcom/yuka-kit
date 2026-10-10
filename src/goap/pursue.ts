import { planGoap, type GoapAction, type GoapPlanOptions } from './planner.js';
import {
    goapStateKey,
    satisfiesGoapConditions,
    type GoapConditions,
    type GoapWorldState,
} from './worldState.js';

/** A plannable action and the asynchronous work that carries it out. */
export interface GoapStep<Context = void> extends GoapAction {
    run(context: Context): Promise<void>;
}

export interface GoapPursueOptions<Context = void> extends GoapPlanOptions {
    /** Steps to take before giving up. */
    readonly maxSteps: number;
    /** Consecutive steps after which the sensed world has not changed, before giving up. */
    readonly stallLimit: number;
    /** Passed to every step's `run`. */
    readonly context: Context;
    /** Told each step before it runs, with the state it was planned from. */
    readonly onStep?: (step: string, state: GoapWorldState) => void;
    /** Stops the pursuit between steps; a step already running is not interrupted. */
    readonly signal?: AbortSignal;
}

export type GoapPursueResult =
    | { readonly reached: true; readonly steps: readonly string[]; readonly last: GoapWorldState }
    | {
          readonly reached: false;
          /**
           * `no-plan`: the planner found no way from the sensed state. `step-limit`: `maxSteps`
           * were taken. `stalled`: `stallLimit` steps running left the sensed world unchanged.
           * `aborted`: the signal fired.
           */
          readonly reason: 'no-plan' | 'step-limit' | 'stalled' | 'aborted';
          readonly steps: readonly string[];
          readonly last: GoapWorldState;
      };

const isPositiveInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0;

/**
 * Pursue `goal` against a world that changes on its own: sense, plan from what
 * was sensed, run the plan's first step, and sense again, until the goal holds
 * or there is no plan, too many steps, no change, or an abort. The world as
 * sensed decides every step; a plan is only ever the next move.
 *
 * This is the asynchronous, frame-free counterpart of `GoapPlanGoal`, for
 * actors whose steps are awaited work (a test driver's input, a network call)
 * rather than Yuka goals ticked by `update()`. A step that throws rejects the
 * pursuit with that error.
 */
export async function pursueGoap<Context = void>(
    goal: GoapConditions,
    steps: readonly GoapStep<Context>[],
    sense: () => Promise<GoapWorldState>,
    options: GoapPursueOptions<Context>,
): Promise<GoapPursueResult> {
    if (!isPositiveInteger(options.maxSteps)) throw new RangeError('maxSteps must be a positive integer');
    if (!isPositiveInteger(options.stallLimit)) throw new RangeError('stallLimit must be a positive integer');
    const taken: string[] = [];
    let state = await sense();
    let unchanged = 0;
    while (!satisfiesGoapConditions(state, goal)) {
        if (options.signal?.aborted) return { reached: false, reason: 'aborted', steps: taken, last: state };
        if (taken.length >= options.maxSteps) {
            return { reached: false, reason: 'step-limit', steps: taken, last: state };
        }
        const plan = planGoap(state, goal, steps, options);
        // A found plan is never empty here: the goal does not hold yet.
        const next = plan.found ? plan.actions[0] : undefined;
        if (!next) return { reached: false, reason: 'no-plan', steps: taken, last: state };
        options.onStep?.(next.id, state);
        taken.push(next.id);
        await next.run(options.context);
        const before = goapStateKey(state);
        state = await sense();
        unchanged = goapStateKey(state) === before ? unchanged + 1 : 0;
        if (unchanged >= options.stallLimit) return { reached: false, reason: 'stalled', steps: taken, last: state };
    }
    return { reached: true, steps: taken, last: state };
}
