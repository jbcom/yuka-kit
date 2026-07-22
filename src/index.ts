/// <reference path="./yuka.d.ts" />
/**
 * @arcade-cabinet/ai-yuka — shared game-AI toolkit over yuka.js.
 *
 * ECS-agnostic: everything here operates on plain yuka Vehicle/GameEntity
 * objects. The koota bridge lives behind the separate
 * `@arcade-cabinet/ai-yuka/koota` entry point.
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
export { createFsm, getStateName } from './fsm/createFsm.js';
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
export { applyPerception, createVisionSensor, inVisionCone, type RaycastFn, type VisionSensor, type VisionSensorOptions, } from './perception/vision.js';
// presets
export { AI_TYPE_PRESETS, createBrainForType } from './presets/aiTypes.js';
// production orchestration
export { EncounterDirector, generateFormation } from './encounters/index.js';
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
export { RoutineAgent, resolveRoutineTarget } from './routines/index.js';
export type {
    ResolvedRoutineTarget,
    RoutineAgentOptions,
    RoutineDecision,
    RoutineDestination,
    RoutineObservation,
    RoutineSchedule,
    RoutineScheduleEntry,
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
