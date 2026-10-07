import { describe, expect, it } from 'vitest';

/**
 * MIGRATION.md promises that every runtime export of the earlier
 * ai-yuka 0.19 line is available from `yuka-kit` under the
 * same name and entry point. This freezes that export list so the promise
 * cannot be broken by a rename or a removal without failing here first.
 */
const legacyRootExports = [
    'AI_TYPE_PRESETS', 'ALIGNMENT_WEIGHT', 'AggressionEvaluator', 'AggressiveChaseEvaluator', 'AttackState',
    'BossBrain', 'BossPhaseEvaluator', 'BossTacticalAgent', 'BrainRegistry', 'COHESION_WEIGHT', 'ChaseEvaluator',
    'ChaseState', 'CircleStrafeEvaluator', 'ClassGovernor', 'DETERMINISTIC_IDENTITY_SCHEMA', 'DeadState',
    'EncounterDirector', 'EnrageEvaluator', 'FleeEvaluator', 'FleeState', 'KeepDistanceEvaluator',
    'MeleeAttackEvaluator', 'OBSTACLE_AVOIDANCE_WEIGHT', 'PatrolState', 'RangedBarrageEvaluator',
    'RetreatAndSummonEvaluator', 'RoutineAgent', 'RoutineSlotConflictError', 'RoutineSlotNotFoundError',
    'SEMANTIC_COMMAND_PROPOSAL_SCHEMA', 'SEPARATION_WEIGHT', 'SeededRandom', 'SemanticProposalValidationError',
    'SurvivalEvaluator', 'TacticalCombatAgent', 'WanderEvaluator', 'addBaseBehaviors', 'addFlockingBehaviors',
    'applyPerception', 'arrive', 'astar', 'canonicalDeterministicIdentityTuple', 'clearDirectionalBehaviors',
    'compareNormalizedUtf8', 'compareSemanticCommandProposals', 'createBossBrain', 'createBrain',
    'createBrainForType', 'createClassGovernor', 'createCombatVehicle', 'createEntityManager', 'createFsm',
    'createVehicle', 'createVisionSensor', 'deriveDeterministicIdentity', 'evade', 'flee', 'followWaypoints',
    'generateFormation', 'getDt', 'getStateName', 'hasAabbLineOfSight2D', 'hasAabbProjectileClearance2D',
    'inVisionCone', 'manage', 'pursuit', 'rankSemanticCommandProposals', 'resolveRoutineTarget',
    'resolveStateAwareRoutineTarget', 'restoreFsmState', 'seek', 'segmentIntersectsAabb2D',
    'selectSemanticCommandProposal', 'setDt', 'setHealthPct', 'setTargetPosition', 'snapshotFsmState', 'stepAI',
    'validateDeterministicIdentity', 'validateEncounterDirectorSnapshot', 'validateFsmStateSnapshot',
    'validateRoutineAgentSnapshot', 'validateSemanticCommandProposal', 'wander',
];

const legacyKootaExports = ['AIBridge', 'AIMemory', 'AIState', 'BossType', 'EnemyType', 'Intent', 'YukaRef'];

const legacySoloExports = [
    'AICommandEnvelopeValidationError', 'AI_COMMAND_DISPATCH_ENVELOPE_SCHEMA', 'SoloAIBridge',
    'SoloCommandAdapter', 'createAICommandDispatchEnvelope', 'runGovernedPlaythrough',
    'validateAICommandDispatchContext', 'validateAICommandDispatchEnvelope', 'validateStrictSoloAICommand',
];

describe('migration surface', () => {
    it.each([
        ['yuka-kit', () => import('./index.js'), legacyRootExports],
        ['yuka-kit/koota', () => import('./koota/index.js'), legacyKootaExports],
        ['yuka-kit/solo', () => import('./solo/index.js'), legacySoloExports],
    ] as const)('%s still exports every name the earlier package did', async (_entry, load, names) => {
        const exported = new Set(Object.keys(await load()));
        expect(names.filter((name) => !exported.has(name))).toEqual([]);
    });
});
