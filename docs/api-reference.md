---
title: API catalogue
description: Find the supported imports and choose the narrowest Yuka Kit primitive for the job.
---

# API catalogue

All items below are exported from `@jbdevprimary/yuka-kit` unless an entry
point is named explicitly. Prefer the smallest primitive that expresses the
game rule; the library intentionally avoids a single opaque AI controller.

## World and movement

| Need | API |
| --- | --- |
| World lifecycle | `createEntityManager`, `manage`, `stepAI` |
| Vehicles | `createVehicle`, `createCombatVehicle` |
| Steering | `addBaseBehaviors`, `addFlockingBehaviors`, `seek`, `flee`, `arrive`, `pursuit`, `evade`, `wander` |
| Path following | `followWaypoints`, `clearDirectionalBehaviors` |
| Grid navigation | `astar` |
| Sight and projectile safety | `createVisionSensor`, `inVisionCone`, `hasAabbLineOfSight2D`, `hasAabbProjectileClearance2D` |

## State and arbitration

| Need | API |
| --- | --- |
| Combat state machine | `createFsm`, `PatrolState`, `ChaseState`, `AttackState`, `FleeState`, `DeadState` |
| Generic goals | `createBrain`, `BrainRegistry`, evaluators, `createBrainForType` |
| Boss phases | `createBossBrain`, `BossBrain`, `BossPhaseConfig` |
| Combat proposals | `TacticalCombatAgent`, `BossTacticalAgent` |
| Class playthrough decisions | `createClassGovernor`, `ClassGovernor` |

## Content orchestration and persistence

| Need | API |
| --- | --- |
| Encounter rolls | `EncounterDirector`, `generateFormation`, `SeededRandom` |
| NPC schedules | `RoutineAgent`, `resolveRoutineTarget`, `resolveStateAwareRoutineTarget` |
| Snapshot validation | `validateFsmStateSnapshot`, `validateEncounterDirectorSnapshot`, `validateRoutineAgentSnapshot` |
| Stable proposals | `deriveDeterministicIdentity`, `validateSemanticCommandProposal`, `selectSemanticCommandProposal` |
| Koota bridge | `@jbdevprimary/yuka-kit/koota`: `AIBridge`, `AIMemory`, `AIState`, `Intent`, `YukaRef` |
| RPGJS Solo bridge | `@jbdevprimary/yuka-kit/solo`: `SoloAIBridge`, `SoloCommandAdapter`, strict envelope helpers |

Every returned `AgentIntent` is descriptive: it is not a side effect. See the
[agent integration contract](../agent-integration/) for the validation and
authority sequence.
