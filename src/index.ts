/// <reference path="./yuka.d.ts" />
/**
 * @jbdevprimary/yuka-kit — shared game-AI toolkit over yuka.js.
 *
 * ECS-agnostic: everything here operates on plain yuka Vehicle/GameEntity
 * objects. The koota bridge lives behind the separate
 * `@jbdevprimary/yuka-kit/koota` entry point.
 *
 * 2D games follow yuka's own documented convention: use Vector3 with y
 * pinned to 0 — there is no separate 2D/3D API split.
 */
// core
export { createEntityManager, manage, stepAI, } from './core/EntityManager.js';
export type { AIType, AIVehicle, AIVehicleConfig, Vec3Like } from './core/types.js';
export { type CombatVehicleOptions, createCombatVehicle, createVehicle, } from './core/VehicleFactory.js';
// steering
export { ALIGNMENT_WEIGHT, addBaseBehaviors, addFlockingBehaviors, type BaseBehaviorOptions, COHESION_WEIGHT, clearDirectionalBehaviors, type FlockingBehaviorOptions, OBSTACLE_AVOIDANCE_WEIGHT, SEPARATION_WEIGHT, } from './steering/behaviors.js';
export { followWaypoints, type PathFollowHandle, type PathFollowOptions, } from './steering/pathFollow.js';
export { arrive, evade, flee, pursuit, seek, wander } from './steering/presets.js';
// fsm
export {
    createFsm,
    getStateName,
    restoreFsmState,
    snapshotFsmState,
    validateFsmStateSnapshot,
    type FsmStateSnapshot,
} from './fsm/createFsm.js';
export { getDt, setDt } from './fsm/dt.js';
export { AttackState, type AttackStateOptions, ChaseState, type ChaseStateOptions, DeadState, FleeState, type FleeStateOptions, PatrolState, type PatrolStateOptions, } from './fsm/states/index.js';
// goals
export { type AIEntity, setHealthPct, setTargetPosition } from './goals/AIEntity.js';
export { AggressiveChaseEvaluator, type BossAttackConfig, type BossBehavior, BossBrain, type BossEntity, type BossPhaseConfig, CircleStrafeEvaluator, createBossBrain, EnrageEvaluator, RangedBarrageEvaluator, RetreatAndSummonEvaluator, } from './goals/bossBrain.js';
export { BrainRegistry, createBrain } from './goals/BrainRegistry.js';
export { AggressionEvaluator, BossPhaseEvaluator, ChaseEvaluator, FleeEvaluator, KeepDistanceEvaluator, MeleeAttackEvaluator, SurvivalEvaluator, WanderEvaluator, } from './goals/evaluators.js';
// pathfinding
export { astar } from './pathfinding/GridAStar.js';
// perception
export { type Aabb2Like, type AabbProjectileClearanceOptions, applyPerception, createVisionSensor, hasAabbLineOfSight2D, hasAabbProjectileClearance2D, inVisionCone, type Point2Like, type RaycastFn, segmentIntersectsAabb2D, type VisionSensor, type VisionSensorOptions, } from './perception/vision.js';
// presets
export { AI_TYPE_PRESETS, createBrainForType } from './presets/aiTypes.js';
// production orchestration
export { EncounterDirector, generateFormation, validateEncounterDirectorSnapshot } from './encounters/index.js';
export type {
    EncounterDecision,
    EncounterDirectorOptions,
    EncounterDirectorSnapshot,
    EncounterProbe,
    EncounterSpawnPlan,
    EncounterTableEntry,
    FormationConstraints,
    FormationPattern,
    FormationResult,
    FormationSpec,
} from './encounters/index.js';
export {
    RoutineAgent,
    RoutineSlotConflictError,
    RoutineSlotNotFoundError,
    resolveRoutineTarget,
    resolveStateAwareRoutineTarget,
    validateRoutineAgentSnapshot,
} from './routines/index.js';
export type {
    ResolvedRoutineTarget,
    RoutineActionIntent,
    RoutineAgentOptions,
    RoutineAgentSnapshot,
    RoutineCrossMapTransitionContext,
    RoutineCrossMapTransitionMapper,
    RoutineDecision,
    RoutineDestination,
    RoutineObservation,
    RoutinePublicPrecondition,
    RoutinePublicValue,
    RoutineSchedule,
    RoutineScheduleEntry,
    RoutineSlotConditions,
    StateAwareRoutineSchedule,
    StateAwareRoutineScheduleEntry,
} from './routines/index.js';
export { ClassGovernor, createClassGovernor } from './governors/index.js';
export type {
    ClassGovernorOptions,
    GovernorAction,
    GovernorActionBinding,
    GovernorActionName,
    GovernorActions,
    GovernorActorObservation,
    GovernorClass,
    GovernorDecision,
    GovernorEnemyObservation,
    GovernorInteractable,
    GovernorObjective,
    GovernorObservation,
} from './governors/index.js';
export { SeededRandom } from './random/index.js';
export type { AgentIntent } from './intents.js';
// strict deterministic proposal protocol
export {
    compareNormalizedUtf8,
    compareSemanticCommandProposals,
    canonicalDeterministicIdentityTuple,
    DETERMINISTIC_IDENTITY_SCHEMA,
    deriveDeterministicIdentity,
    rankSemanticCommandProposals,
    SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
    selectSemanticCommandProposal,
    SemanticProposalValidationError,
    validateDeterministicIdentity,
    validateSemanticCommandProposal,
} from './proposals/index.js';
export type {
    SemanticCommandProposal,
    SemanticProposalSelection,
    SemanticProposalTarget,
    SemanticProposalValidationCode,
    DeterministicIdentityKind,
    DeterministicIdentityValue,
} from './proposals/index.js';
// command-neutral combat tactics
export * from './combat/index.js';
