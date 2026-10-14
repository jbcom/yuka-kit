/// <reference path="../yuka.d.ts" />
/**
 * @module yuka-kit/goap
 * Goal-oriented action planning over Yuka's goal system: a deterministic A*
 * planner over world-state predicates, an action registry that equipment can
 * contribute to, an executor that runs plans as Yuka composite goals
 * chosen by `Think` through `GoapGoalEvaluator`, and `pursueGoap`, its
 * asynchronous frame-free counterpart for steps that are awaited work.
 */
export {
    applyGoapEffects,
    conditionHolds,
    countUnsatisfied,
    goapStateKey,
    satisfiesGoapConditions,
    type GoapCondition,
    type GoapConditions,
    type GoapEffects,
    type GoapPredicate,
    type GoapValue,
    type GoapWorldState,
} from './worldState.js';
export {
    compareGoapIds,
    DEFAULT_GOAP_MAX_EXPANSIONS,
    planGoap,
    validateGoapAction,
    type GoapAction,
    type GoapPlanFound,
    type GoapPlanNotFound,
    type GoapPlanOptions,
    type GoapPlanResult,
} from './planner.js';
export { GoapActionRegistry, type GoapActionDefinition } from './registry.js';
export {
    DEFAULT_GOAP_MAX_REPLANS,
    GOAP_PLAN_SNAPSHOT_STEP_LIMIT,
    GoapGoalEvaluator,
    GoapPlanGoal,
    validateGoapPlanSnapshot,
    type GoapGoalEvaluatorOptions,
    type GoapPlanFailure,
    type GoapPlanGoalOptions,
    type GoapPlanSnapshot,
    type GoapPlanStatus,
} from './executor.js';
export { pursueGoap, type GoapPursueOptions, type GoapPursueResult, type GoapStep } from './pursue.js';
