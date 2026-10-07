# Decisions

Each decision records what was chosen and why. Newest first.

## The package is named `yuka-kit`

**Decision.** The npm name is the unscoped `yuka-kit`. The scoped
`@jbdevprimary/yuka-kit` and the private-registry `ai-yuka` and `yuka-kit`
packages are retired in its favour; see [MIGRATION.md](../MIGRATION.md).

**Why.** A game-AI toolkit that anyone can install should not carry a personal
or organisation scope, and one name beats four. The rename is a breaking
change (`feat!:`), so release-please cuts a clearly marked version for it.
Every version of the old public name is deprecated with a pointer to the new
one and none is unpublished, so existing lockfiles keep installing.

**First publication.** npm cannot attach a trusted publisher to a name that
does not exist yet, so the first `yuka-kit` version is published by hand from
its release tag without provenance, then the trusted publisher is configured
for `release.yml`. The publish job checks the registry first: a version that
is already published is skipped (never published twice), and a package that is
not on npm at all is a `::warning::` skip rather than a failed job. Any other
lookup failure still fails the job. The workflow contract test enforces all
three behaviours (see `scripts/release-workflow-contract.mjs`).

## `ai-yuka` converges into `yuka-kit`; `yuka-kit` is a strict superset

**Decision.** Nothing from `ai-yuka` needed folding in. `yuka-kit` already
contains all of it, so the convergence adds a migration guide and a test that
holds the promise, and removes provenance text.

**Evidence.**

- Source diff of `ai-yuka` 0.19.1 against `yuka-kit`: no behavioural difference
  in any shared module. The differences are `yuka-kit`'s additions (below) and
  documentation comments.
- Built both packages and compared the ESM entry points' runtime exports:
  `.` 84 vs 95, `./koota` 7 vs 10, `./solo` 9 vs 9, and `ai-yuka` has no
  `./goap`. No name present in `ai-yuka` is missing from `yuka-kit` (values),
  and no exported type is missing either (declaration barrels).
- `ai-yuka`'s own 11 test files (104 tests) were copied over `yuka-kit`'s
  sources in a scratch tree and all pass.
- `src/migration-surface.test.ts` freezes the old runtime export names so a
  future rename or removal fails a test instead of breaking a migration.

**Export-by-export map.** "same" means the export exists in both packages with
the same name and entry point; "new" means only `yuka-kit` has it.

| Entry point | Module | Exports | Status |
| --- | --- | --- | --- |
| `.` | core | `createEntityManager`, `manage`, `stepAI`, `createVehicle`, `createCombatVehicle`, types `AIType`, `AIVehicle`, `AIVehicleConfig`, `Vec3Like`, `CombatVehicleOptions` | same |
| `.` | steering | `addBaseBehaviors`, `addFlockingBehaviors`, `clearDirectionalBehaviors`, weight constants, `followWaypoints`, `seek`, `flee`, `arrive`, `pursuit`, `evade`, `wander` and their option types | same |
| `.` | fsm | `createFsm`, `getStateName`, `snapshotFsmState`, `restoreFsmState`, `validateFsmStateSnapshot`, `getDt`, `setDt`, `PatrolState`, `ChaseState`, `AttackState`, `FleeState`, `DeadState` and option types | same |
| `.` | goals | `AIEntity`, `setTargetPosition`, `setHealthPct`, `createBrain`, `BrainRegistry`, `BossBrain`, `createBossBrain`, the boss and general evaluators, `AI_TYPE_PRESETS`, `createBrainForType` | same |
| `.` | pathfinding | `astar` | same |
| `.` | perception (sight) | `createVisionSensor`, `inVisionCone`, `applyPerception`, `hasAabbLineOfSight2D`, `hasAabbProjectileClearance2D`, `segmentIntersectsAabb2D` and types | same |
| `.` | perception (light) | `lightScaledRange`, `inLitVisionCone`, `createLitVisionSensor` and types | new |
| `.` | perception (hearing) | `createHearingSensor`, `NoiseBuffer`, `perceiveNoise`, `attenuateNoise`, `validateNoiseEvent` and types | new |
| `.` | perception (memory) | `PerceptionMemory`, `PERCEPTION_MEMORY_CAPACITY_LIMIT`, `validatePerceptionMemorySnapshot` and types | new |
| `.` | combat | `TacticalCombatAgent`, `BossTacticalAgent` and their decision types | same |
| `.` | encounters | `EncounterDirector`, `generateFormation`, `validateEncounterDirectorSnapshot` and types | same |
| `.` | routines | `RoutineAgent`, `resolveRoutineTarget`, `resolveStateAwareRoutineTarget`, `validateRoutineAgentSnapshot`, slot errors and types | same |
| `.` | governors | `ClassGovernor`, `createClassGovernor` and the `Governor*` types | same |
| `.` | random, intents | `SeededRandom`, `AgentIntent` | same |
| `.` | proposals | deterministic identity and semantic proposal helpers, schema constants and types | same |
| `./koota` | traits | `AIMemory`, `AIState`, `BossType`, `EnemyType`, `Intent`, `YukaRef` | same |
| `./koota` | traits | `AIHearing`, `AIAwareness`, `AIPerceptionMemory` | new |
| `./koota` | bridge | `AIBridge` (existing methods unchanged; adds `rememberNoise`, `syncPerceptionMemory`) | same, extended |
| `./solo` | adapter, strict, vehicle, playthrough | `SoloCommandAdapter`, `SoloAIBridge`, `runGovernedPlaythrough`, the strict envelope helpers, schema constant and types | same |
| `./goap` | planner, registry, executor | `planGoap`, `GoapActionRegistry`, `GoapPlanGoal`, `GoapGoalEvaluator`, `validateGoapPlanSnapshot` and related | new |

The package also ships the bundled ambient `yuka` declaration; the `yuka-kit`
copy is the merged superset of the same file.

## Snapshot schema tags are never renamed

**Decision.** The `schema` strings in persisted snapshots (for example
`arcade-ai-yuka-encounters`, `arcade-ai-yuka-fsm`) and the deterministic
identity prefix keep their original values.

**Why.** They are wire identifiers inside players' save files and inside
replay records. Renaming them would make every existing save fail validation
for no functional gain, and accepting both spellings would double the
validation surface of seven closed schemas. They are documented as opaque
stable strings in [persistence](./persistence.md).

## Examples and comments are written for the package

**Decision.** Comments, README and docs describe the toolkit on its own terms.
Remarks naming the projects the code grew in, the standalone provenance
document, and a release-history paragraph in the README were removed; the
changelog is the record of what each release added.

**Why.** A shared open-source package's documentation should read the same to
every consumer, without the history of any one game. The dependency-currency
check's name-based refusal of one private scope was dropped with it: a package
that is not on the public registry already fails closed at the registry lookup,
which is the property that matters.
