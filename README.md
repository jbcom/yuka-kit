# yuka-kit

[![npm](https://img.shields.io/npm/v/yuka-kit)](https://www.npmjs.com/package/yuka-kit)
[![CI](https://github.com/jbcom/yuka-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/jbcom/yuka-kit/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/yuka-kit)](LICENSE)

Shared game-AI toolkit wrapping [yuka.js](https://mugen87.github.io/yuka/) for
browser and Node games: steering helpers, combat FSM states, goal-driven
`Think` brains with phase-aware boss AI, a deterministic GOAP planner that runs
plans as Yuka goals, grid A\* pathfinding, physics-agnostic vision (including
light-scaled vision), hearing and per-target perception memory, deterministic
encounter spawning, authored NPC routines, class-specific playthrough
governors, and optional Koota/RPGJS Solo bridges.

**Documentation:** [jonbogaty.com/yuka-kit](https://jonbogaty.com/yuka-kit/)
for guided integration, API catalogue, persistence rules, and the agentic
command boundary. The site also publishes `llms.txt` and `llms-full.txt` from
the same reviewed documentation graph.

This repository is the source of truth for the package; see
[CHANGELOG.md](CHANGELOG.md) for what each release added. The public Node.js
`>=22` compatibility contract and the exact peer on the current Yuka release
hold across releases. Repository verification and publication use the Node.js
26 toolchain recorded in `.nvmrc`, with CI covering Node.js 22, 24 and 26.
Major-only selectors accept maintained patches without requiring an exact
Node.js version. Odd-numbered, end-of-life lines are outside the support policy.

Coming from an earlier name of this package? See [MIGRATION.md](MIGRATION.md).

## Install

```sh
pnpm add yuka-kit yuka
# koota only if you use the ECS bridge:
pnpm add koota
```

`yuka` (`0.7.8`) is an exact peer dependency. `koota` is an **optional** peer — only
needed for the `yuka-kit/koota` entry point.

yuka ships no TypeScript types; this package bundles an ambient
`declare module 'yuka'` that consumers get transitively. If your repo has its
own local `yuka.d.ts`, delete it when adopting this package.

## Modules

Everything except `koota/` is ECS-agnostic and operates on plain yuka
`Vehicle`/`GameEntity` objects. 2D games follow yuka's own convention: use
`Vector3` with `y` pinned to 0 — there is no separate 2D API.

### core

```ts
import { createVehicle, createCombatVehicle, createEntityManager, manage, stepAI } from 'yuka-kit';

const enemy = createCombatVehicle(
  { speed: 3 }, // any config object with a speed works (mass/maxForce optional)
  {
    target: playerVehicle,
    onAttack: (owner) => combat.strike(owner),
    patrol: { detectionRange: 12 },
  },
);
// enemy.stateMachine: patrol ⇄ chase ⇄ attack, + dead

const manager = createEntityManager(); // one per world — never a singleton
manage(manager, enemy);
stepAI(manager, dt, brainRegistry); // combat FSMs, steering/entities, then GOAP arbitration
```

### fsm

`PatrolState`, `ChaseState`, `AttackState`, `DeadState`, `FleeState` — combat
states, parameterized (ranges, cooldowns, and transition state ids are
constructor options; targets injected via `setTarget`). `createFsm(vehicle,
states, initial)` wires a StateMachine; `getStateName(fsm)` resolves the
current state's registration id.

`snapshotFsmState()` / `restoreFsmState()` persist only that registered state
id, keeping Yuka class instances out of save data while resuming patrol,
chase, attack, or dead behavior through the existing machine.
`validateFsmStateSnapshot()` validates untrusted JSON against the package's
closed snapshot schema before any machine transition.

Time-based states read frame dt from the vehicle. `stepAI()` writes it and
updates every managed combat FSM before steering; custom loops can call
`setDt(vehicle, dt)` directly (the Koota `AIBridge` exposes the same helper).

### steering

- `addBaseBehaviors(vehicle, obstacles, weights?)` — separation + obstacle avoidance
- `addFlockingBehaviors(vehicle, weights?)` — alignment + cohesion
- `clearDirectionalBehaviors(vehicle)` — drops seek/flee/pursuit/wander, keeps group behaviors
- one-liners: `seek`, `flee`, `arrive`, `pursuit`, `evade`, `wander` (add + return the behavior)
- `followWaypoints(vehicle, waypoints, options?)` — Path + FollowPathBehavior +
  OnPathBehavior with tuned defaults; returns a handle with
  `finished()`/`clear()`. Note yuka's `finished()` flips true when the index
  *reaches* the final waypoint (still traveling to it).

### goals

- Entity-tag evaluators (the game loop refreshes
  `setTargetPosition(entity, pos)` / `setHealthPct(entity, pct)` each frame):
  `ChaseEvaluator`, `MeleeAttackEvaluator`, `KeepDistanceEvaluator`,
  `WanderEvaluator`, `FleeEvaluator`.
- Getter-injected evaluators (accessor functions passed at construction):
  `AggressionEvaluator`, `SurvivalEvaluator`, `BossPhaseEvaluator`.
- `createBrain(entity, evaluators)` — Think + `_brain` back-reference tag.
- `BrainRegistry` — per-world brain lifecycle (register/unregister/updateAll/reset).
- `BossBrain` / `createBossBrain(entity, phases)` — phase-aware boss Think:
  health thresholds advance phases (never regress), evaluator biases shift per
  phase, winning evaluator tags `_activeBehavior`
  (`circle-strafe` / `aggressive-chase` / `retreat-and-summon` /
  `ranged-barrage` / `enrage`). `BossPhaseConfig` is a structural subset of the
  package's boss content schemas.

### presets

`AI_TYPE_PRESETS` maps the standard archetypes
(`melee`/`ranged`/`pack`/`ambush`/`boss`/`passive`) to evaluator bundles;
`createBrainForType(entity, aiType, bossPhases?)` builds the brain (boss +
phases ⇒ full `BossBrain`). Games keep their own content-id → AIType lookup
(for example a table keyed by enemy id).

### combat tactics

`TacticalCombatAgent` turns melee, ranged, charge, and ambush observations
into command-neutral `AgentIntent`s through Yuka `Think`/`GoalEvaluator`
arbitration. Detection, attack bands, survival retreat, cooldown readiness,
and each game's action payloads remain explicit inputs, so one tactics model
serves every game rather than each reimplementing its own enemy loop.

`BossTacticalAgent` composes the existing phase-aware `BossBrain` and converts
its winning behavior into movement, melee, barrage, summon, or orbit intents.
The game still owns damage, spawning, collision, and presentation.

```ts
const archer = new TacticalCombatAgent({
  tactic: 'ranged', detectionRange: 12, attackRange: 10, preferredRange: 7,
  attackIntent: ({ targetId }) => ({
    kind: 'action', action: 'combat:use', payload: { actionId: 'arrow', targetId },
  }),
});

const decision = archer.decide({
  position: enemyPosition, target: heroPosition, targetId: 'hero',
  healthPct: 0.8, attackReady: true,
});
```

### pathfinding

`astar(grid, sx, sy, ex, ey)` — octile-heuristic, binary-min-heap A\* over
`grid[y][x] === 0` walkability with corner-cut prevention. Returns `[x, y]`
cells start→end inclusive, `[]` when unreachable.

### perception

- `createVisionSensor(raycastFn, { range, isTarget })` — line-of-sight over any
  physics engine (Rapier, cannon, custom) via an adapter function.
- `inVisionCone(origin, forward, target, range, halfAngleRad)` — pure-math cone test.
- `hasAabbLineOfSight2D(from, to, obstacles, padding?)` — physics-neutral
  collision visibility for center-positioned rectangular obstacles.
- `hasAabbProjectileClearance2D(from, to, obstacles, options)` — strict
  radius-aware muzzle-to-impact clearance for ranged AI; unlike visibility,
  a projectile spawned inside a padded obstacle is blocked.
- `applyPerception(seen, fsm, stateWhenSeen)` — the raycast→FSM
  pattern: transition once on sighting.

#### light-scaled vision

Actors in darkness are harder to see. `lightScaledRange(light, { range,
minRange?, exponent? })` maps a light level in `[0, 1]` to a vision range of
`minRange + (range - minRange) * light ** exponent`. Two helpers compose it
with the existing sensors:

- `inLitVisionCone(origin, forward, target, { range, halfAngleRad, lightAt,
  minRange?, exponent? })` — `inVisionCone` with the range taken from
  `lightAt(target)`.
- `createLitVisionSensor(raycast, { range, isTarget, lightAt, minRange?,
  exponent? })` — `createVisionSensor` that casts toward a specific target
  with the light-scaled range: `sensor.seesTarget(origin, target)` casts a
  unit-length direction and skips the cast when the target is out of range;
  `sensor.rangeFor(target)` exposes the range it would use. A co-located
  target is always seen, as in `inVisionCone`.

`lightAt` must return a finite number. Values outside `[0, 1]` are clamped, so
a floodlight that reports `3` still means "fully lit". `minRange` covers
senses that work in the dark, such as a dog that notices anything within two
metres.

#### hearing

Noise is an event, not a ray. `NoiseEvent` is `{ position, loudness, kind,
time, source? }`; `loudness` is the level at the reference distance.

- `attenuateNoise(distance, options?)` — distance gain using the Web Audio
  `PannerNode` distance models: `'inverse'` (default), `'linear'`, and
  `'exponential'`, with `refDistance` (default `1`), `maxDistance` (default
  `10000`, used by `'linear'`), and `rolloffFactor` (default `1`). An
  `'exponential'` model with `rolloffFactor: 2` is the inverse-square law.
- `perceiveNoise(listener, event, { threshold, ...distance options,
  occlusion? })` — returns `{ event, perceived, distance, transmission }` when
  `loudness × gain × transmission ≥ threshold`, else `null`. `occlusion(from,
  to, event)` returns the fraction of sound that passes through walls, from `0`
  (blocked) to `1` (clear). It is called only for noises that would be audible
  without occlusion, so an expensive raycast is skipped for distant noises.
- `createHearingSensor(options).hear(listener, events)` — every audible noise,
  loudest first; ties break by most recent `time`, then `kind`, then `source`,
  then input order, so the result is deterministic.
- `NoiseBuffer({ ttl, capacity? })` — a world-owned list of recent noises:
  `emit(event)`, `active(now)` (events with `now - ttl ≤ time ≤ now`), and
  `prune(now)`. When full it drops the oldest event.

Each listener has its own `threshold`, so a guard dog can hear what a digger
misses.

#### perception memory

`AIMemory` (Koota) keeps one last-seen position. `PerceptionMemory` keeps a
record per target and remembers both senses:

```ts
const memory = new PerceptionMemory({ halfLife: 8, forgetBelow: 0.05 });
memory.recordSighting('mummy', mummy.position, now);           // confidence 1
memory.recordNoise(heard); // targetId from heard.event.source, confidence 0.5
const best = memory.strongest(now);    // highest decayed confidence
const where = memory.lastKnownPosition('mummy', now); // newest of seen/heard
```

- `recordSighting(targetId, position, time, confidence = 1)` and
  `recordNoise(heard, { targetId?, confidence? })` add evidence. A noise uses
  its event's `time` and, unless `targetId` is given, its `source`; its default
  confidence is the memory's `hearingConfidence` option (default `0.5`).
- A record holds `lastSeen` (`position`, `time`), `lastHeard` (`position`,
  `time`, `loudness`, `kind`), `lastSensedTime`, and `confidence`.
- Confidence decays exponentially with `halfLife` seconds. It is computed on
  read from the stored value, so reading never changes state. Sensing a
  target again sets confidence to the larger of the decayed value and the new
  one.
- Records below `forgetBelow` are hidden from `get`, `recall`, and
  `strongest`, and `prune(now)` deletes them. `capacity` (default `256`)
  evicts the weakest record first.
- Out-of-order events (a noise from earlier in the frame, after a sighting)
  keep each field's newest value and never move time backwards.
- `recall(now)` orders records by confidence, then recency, then `targetId`.
- `memory.snapshot()` and `PerceptionMemory.restore(snapshot)` round-trip the
  memory through JSON with the same closed, bounded validation as the other
  snapshots. `validatePerceptionMemorySnapshot(value)` validates without
  restoring.

### encounters

`EncounterDirector` consumes monotonic player movement steps rather than frame
time. It combines safe-zone and content eligibility gates, cooldowns, pity
pressure, recent-repeat suppression, a serializable seeded PRNG, and actual
Yuka `Think`/`GoalEvaluator` weighted arbitration. A successful decision
returns a spawn plan; the game remains responsible for creating its authored
entities.

`validateEncounterDirectorSnapshot()` validates the entire closed encounter
snapshot—including PRNG state, history, cooldown records, and per-map budgets—
before `EncounterDirector.restore()` changes any live director state.
Retained history is capped at 100,000 entries. At the same persistence limit,
`consider()` rejects a probe that could introduce a new encounter id or a new
map-budget record; existing ids and records remain usable and every emitted
snapshot remains restorable.

`generateFormation()` turns that plan into ring, ambush, line, wedge, or
scatter positions while enforcing injected walkability, visibility, and range
constraints. This keeps map/navmesh ownership in the game.

### routines

`RoutineAgent` resolves daily schedule windows and uses a Yuka `Think` brain to
choose transfer, travel, activity, dwell, and return-home intents. Activity
acknowledgement happens only after the command is accepted, preventing an NPC
from silently skipping a failed interaction.
`RoutineAgent.snapshot()` / `restore()` retain those accepted daily activity
keys, so loading a save does not repeat already-completed work.
`validateRoutineAgentSnapshot()` validates the complete closed schema before
`restore()` replaces any accepted-activity state.
Accepted activity keys are capped at 100,000. A duplicate acknowledgement stays
idempotent, while acknowledging a new key at capacity throws until the host
releases obsolete daily keys with `resetDay()`.

```ts
const smith = new RoutineAgent({
  schedule: {
    home: { mapId: 'cottage', position: { x: 2, y: 0, z: 2 }, action: 'sleep' },
    entries: [{
      id: 'forge-shift', startMinute: 480, endMinute: 1020,
      mapId: 'town', position: { x: 12, y: 0, z: 8 }, action: 'work-forge',
    }],
  },
});
```

The legacy `RoutineSchedule` remains ordered and clock-only: its first matching
entry wins, `startMinute`/`endMinute` remain required numbers, no matching entry
returns `home`, and a cross-map target still emits `transfer-map`. State-aware
selection is a separate opt-in contract:

```ts
import {
  RoutineAgent,
  type StateAwareRoutineSchedule,
} from 'yuka-kit';

const schedule: StateAwareRoutineSchedule = {
  entries: [
    {
      id: 'accepted-keep-work',
      // Omit both minute bounds for an all-day phase/cue slot. A single
      // bound is also legal for an authored open-ended window.
      mapId: 'keep',
      anchorId: 'keep-custody-work',
      position: { x: 4, y: 0, z: 6 },
      action: 'perform-scheduled-activity',
      when: {
        phaseIds: ['custody-work', 'custody-aftermath'],
        days: [2, 5],
        requiredCueIds: ['gate-admitted'],
        forbiddenCueIds: ['route-blocked'],
        publicPreconditions: [
          { key: 'doorOpen', operator: 'equals', value: true },
        ],
      },
    },
    {
      id: 'lawful-staging',
      fallback: true,
      startMinute: 480,
      endMinute: 1_020,
      mapId: 'town',
      position: { x: 10, y: 0, z: 8 },
      action: 'wait-at-staging-anchor',
    },
  ],
};

const agent = new RoutineAgent({
  schedule,
  slotSelection: 'state-aware',
  mapCrossMapTransition: ({ target, observation }) => ({
    kind: 'action',
    action: 'request-scheduled-transition',
    payload: {
      slotId: target.id,
      destinationMapId: target.mapId,
      destinationAnchorId: target.anchorId,
      observationTick: observation.observationTick,
    },
  }),
});
```

State-aware conditions are declarative and scalar-only; there are no callback
predicates that can capture mutable engine state or hidden narrative memory.
`phaseId` selects one exact phase, while `phaseIds` means any one exact member;
defining both on a slot is invalid. Primary matches always outrank declared
fallbacks. Within a group, phase/cue specificity outranks public preconditions,
then authored day/clock specificity. The narrowest matching phase set wins.
An equal-specificity overlap throws `RoutineSlotConflictError`; no matching
slot throws `RoutineSlotNotFoundError`. Both failures occur before Yuka
arbitration or the transition mapper, so no AI command is proposed.
Strict schedules do not require `home`; consumers never fabricate an ignored
map or coordinate merely to satisfy the type.

The transition mapper receives a frozen public observation and destination
context and must return a non-empty `action` intent. It cannot return
`transfer-map`; the authoritative game action may validate the request and
emit a system-owned transfer. Omitting the mapper preserves existing behavior.

### class governors

`ClassGovernor` is the reusable Yuka brain used by AI-governed playthroughs.
Knight, hunter, and mage are distinct policies rather than reskins:

- knight closes to melee range, reads telegraphs, blocks, rushes priority
  targets, and spends resource on area pressure;
- hunter maintains a ranged band, rolls out of close pressure, traps groups,
  and commits its rite against boss-grade targets;
- mage wards telegraphed pressure, blinks out of danger, spends resource on
  area control, and falls back to ranged bolts or retreat.

Survival, safe interaction, combat, objective, exploration, and idle are
competing `GoalEvaluator`s. The brain returns intent only; it cannot mutate a
game world.

Low-health observations may include a path-aware `recovery` objective. The
governor prioritizes its next waypoint over blind edge-clamped fleeing, uses
the class's advertised defense against an immediate telegraph, and dispatches
the authored healer/cache interaction only after reaching its usable radius.
The game remains responsible for pathfinding, healing effects, and deciding
which recovery sources are currently valid.

### strict deterministic proposals

The additive strict protocol is for authored integrations that must rank and
replay governor choices without trusting Yuka evaluator insertion order or
letting a governor construct a runtime command. `SemanticCommandProposal` is a
closed, immutable shape containing only stable ids, integer ordinals, signed
integer `utilityMicros`, and observation-entry targets. It cannot express a
coordinate, payload, callback, teleport, transfer, or runtime reference.

`rankSemanticCommandProposals()` returns the entire detached, frozen set in a
host-independent total order; `selectSemanticCommandProposal()` also returns
the first member or `null` for no dispatch. Target arrays are canonicalized by
their authored role ordinal. All remaining string ties use unsigned NFC UTF-8
bytes, never locale collation, floating comparison, random choice, or source
insertion order.

```ts
import {
  deriveDeterministicIdentity,
  selectSemanticCommandProposal,
  SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
} from 'yuka-kit';

const streamId = deriveDeterministicIdentity('stream', [
  'npc-routine', 'policy:smith', 'entity:smith', 'scope:forge',
]);
const proposalId = deriveDeterministicIdentity('proposal', [
  streamId, 8, 'goal:work', 'binding:perform-work', 0, 'visible:forge',
]);
const { selected, ordered } = selectSemanticCommandProposal([{
  schema: SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
  streamId,
  decisionOrdinal: 8,
  observationDigest,
  proposalId,
  goalId: 'goal:work',
  goalOrdinal: 1,
  utilityMicros: 900_000,
  bindingId: 'binding:perform-work',
  bindingOrdinal: 2,
  proposalOrdinal: 0,
  targets: [{
    roleId: 'workstation', roleOrdinal: 0,
    targetObservationEntryId: 'visible:forge',
  }],
  reasonCode: 'WORKSTATION_AVAILABLE',
}]);
```

`deriveDeterministicIdentity()` and `validateDeterministicIdentity()` hash a
closed positional tuple with SHA-256 and return typed `stream:`, `proposal:`,
or `receipt:` ids. They use the pinned browser-safe `@noble/hashes` library;
tuple data permits only nested arrays and canonical scalar JSON values.

Knight adapters bind both `knightBlock` and `knightUnblock`; the latter should
map to the engine's public guard action with `{ active: false }`. Observing
`actor.guarding` lets the governor hold that guard through the complete enemy
startup telegraph, then release it through the public action before resuming
movement.

### RPGJS Solo (separate entry: `yuka-kit/solo`)

`SoloCommandAdapter` maps the Yuka XZ plane to RPGJS Solo XY commands and
forces `source: 'ai'`. `runGovernedPlaythrough()` repeatedly observes the real
game, arbitrates through the selected class brain, dispatches through the same
public command boundary as keyboard input, advances the normal game tick, and
fails on rejected commands, stalls, or step limits. It never teleports or
writes runtime state directly.

Strict integrations use `createAICommandDispatchEnvelope()`. The envelope
contains the complete frozen semantic proposal plus duplicated identity,
Rules tick, observation digest, and a caller-defined deterministic Rules
precondition SHA-256. That precondition may be a binding-scoped read-set digest
instead of a digest of the entire Rules view. The envelope contains no
precompiled command. `dispatchEnvelope()` first revalidates those values
against current public state and only then invokes the supplied trusted binding
compiler. The compiler's output is closed to `move`, `stop`, or registered
`action` with `source: 'ai'`; illegal transfers, mutable references, non-JSON
payloads, and extra fields fail before Solo dispatch.

```ts
import {
  createAICommandDispatchEnvelope,
  SoloCommandAdapter,
} from 'yuka-kit/solo';

const adapter = new SoloCommandAdapter(runtime);
if (selected) {
  const pending = createAICommandDispatchEnvelope({
    proposal: selected,
    rulesTick,
    expectedRulesRevisionSha256,
  });
  adapter.dispatchEnvelope(pending, {
    rulesTick,
    observationDigest,
    rulesRevisionSha256: currentRulesRevisionSha256,
  }, (proposal) => {
    // Trusted catalogs resolve proposal.bindingId and observation entry ids.
    return { type: 'action', entityId: 'smith', action: 'work', source: 'ai' };
  });
}
void ordered; // retain the complete ranked set for deterministic receipts
```

The existing `commandFor()` and `dispatch()` intent APIs are unchanged for
legacy integrations, including their explicit `transfer-map` support. They do
not claim the strict proposal guarantees.

```ts
import { ClassGovernor } from 'yuka-kit';
import { SoloCommandAdapter, runGovernedPlaythrough } from 'yuka-kit/solo';

const governor = new ClassGovernor({
    className: 'hunter',
    actions: {
        hunterShot: {
            action: 'combat:use',
            payload: { actionId: 'hunter:shoot' },
        },
    },
});
const adapter = new SoloCommandAdapter(runtime);
await runGovernedPlaythrough({
  entityId: 'hero', governor, adapter,
  observe, advance: () => runtime.stepTicks(1), isComplete,
});
```

When observations use normalized tile or meter coordinates while Solo renders
Tiled pixels, configure both position and explicit speed conversion at the
boundary:

```ts
const adapter = new SoloCommandAdapter(runtime, {
  toRuntimePosition: ({ x, z }) => ({ x: x * 16, y: z * 16 }),
  toRuntimeSpeed: (speed) => speed * 16,
});
```

The game's `observe()` adapter should populate `actor.readyActions` from the
engine's side-effect-free combat availability queries and set
`actor.movementAvailable` from its movement query. Governors then wait through
startup, recovery, cooldown, root, and stun windows rather than probing the
runtime with commands expected to fail. Omitting either field preserves the
original always-ready behavior for non-combat adapters.

Enemy steering uses the same boundary. `SoloAIBridge` normalizes authoritative
Solo pixel positions into Yuka units, then dispatches Yuka velocity as ordinary
AI-source movement commands after `stepAI()` advances the shared FSM/GOAP loop:

```ts
const adapter = new SoloCommandAdapter(runtime, {
  toRuntimePosition: ({ x, z }) => ({ x: x * 16, y: z * 16 }),
});
const bridge = new SoloAIBridge(adapter, { runtimeUnitsPerYukaUnit: 16 });

bridge.syncFromSolo(enemyVehicle, runtime.getEntity('slime'));
stepAI(entityManager, 1 / 60);
bridge.dispatchToSolo(enemyVehicle, runtime.getEntity('slime'), combat.canMove('slime').available);
```

### GOAP (separate entry: `yuka-kit/goap`)

Goal-oriented action planning on top of Yuka's goal system. A `Think`
evaluator picks *what* to do; the planner works out *how*, as a sequence of
actions; the plan runs as Yuka goals, one action at a time.

```ts
import {
  GoapActionRegistry, GoapGoalEvaluator, planGoap,
} from 'yuka-kit/goap';

const actions = new GoapActionRegistry<Companion>();
actions.register({
  id: 'approach-in-darkness', cost: 2,
  preconditions: { targetKnown: true }, effects: { nearTarget: true },
  createGoal: (owner) => new ApproachGoal(owner),
});
actions.register({
  id: 'extinguish-torch', cost: 1,
  preconditions: { nearTorch: true }, effects: { targetLit: false },
  createGoal: (owner) => new ExtinguishGoal(owner),
});
actions.register({
  id: 'claim', cost: 1,
  preconditions: { nearTarget: true, targetLit: false, mana: { op: 'gte', value: 10 } },
  effects: { targetClaimed: true },
  createGoal: (owner) => new ClaimGoal(owner),
});

// An equipped item contributes actions; unequipping revokes them.
const unequip = actions.contribute('item:sun-staff', [emitPulse]);

brain.addEvaluator(new GoapGoalEvaluator({
  goalId: 'claim',
  goal: { targetClaimed: true },
  registry: actions,
  sense: (owner) => owner.worldState(),
  desirability: (owner) => owner.role === 'hunt' ? 0.8 : 0.2,
}));
```

**World state** is a flat record of `string | number | boolean` values.
A **condition** is either a value (equality) or a predicate
`{ op: 'eq' | 'neq', value }` / `{ op: 'lt' | 'lte' | 'gt' | 'gte', value:
number }`. A missing key fails every condition except `neq`. **Effects** set
values.

**Actions** are `{ id, cost, preconditions, effects }`. `cost` is a
non-negative number, or a function of the search state (so an action can cost
more after an earlier step spent a resource). A function cost should declare
`minCost`, the cheapest it can ever be; the planner throws if it returns less,
because a wrong lower bound would make plans silently suboptimal.

**`planGoap(start, goal, actions, { maxExpansions? })`** is A\* over world
states. It returns `{ found: true, actions, cost, expanded }` with a cheapest
plan, or `{ found: false, reason, expanded }` where `reason` is
`'unreachable'` (the search space is exhausted) or `'expansion-limit'`
(`maxExpansions`, default `2048`, was hit first). The heuristic, unsatisfied
goal conditions divided by the most goal conditions any single action can
fix, times the cheapest action cost, never overestimates, so returned plans
are optimal. Ties are broken deterministically: actions expand in `id` order
(UTF-16 code-unit comparison, not locale order), so the same action set
returns the same plan whatever order it was registered in. Duplicate ids,
negative or non-finite costs, and malformed conditions throw `TypeError`
before the search starts.

**`GoapActionRegistry<Owner>`** holds an agent's actions and their Yuka goal
factories (`createGoal(owner)`). `register(definition, source = 'base')` and
`contribute(source, definitions)` (all or nothing) return an undo function;
`revoke(source)` removes everything a source added. An optional
`isAvailable(owner)` hides an action at planning time, for checks that do not
belong in world state. `actionsFor(owner)` lists the plannable actions in `id`
order.

**`GoapPlanGoal<Owner>`** is a Yuka `CompositeGoal` that plans on activation
and runs the plan as one subgoal per action:

- Before each step it senses the world again and checks that the step's
  action is still registered (an unequipped item's actions stop at once), its
  preconditions, and `isAvailable`. If they no longer hold, or the step's goal
  fails, it replans from the current state, up to `maxReplans` (default `3`)
  times, and then fails.
- When the last step completes, it checks the goal against the sensed state.
  If the goal does not hold yet, it replans.
- A missing plan sets the goal to `FAILED`, and `lastFailure` records why,
  so `Think` re-arbitrates on its next update.
- `plan`, `step`, `currentActionId`, and `replans` expose progress, for
  example for `bridge.writeIntent(entity, goal.currentActionId ?? '')`.

**`GoapGoalEvaluator<Owner>`** is the `Think` integration. Its desirability
comes from your `desirability(owner)` function. By default it scores `0` when
no plan exists, so `Think` never picks an impossible goal; it plans once per
arbitration and hands that plan to the goal. Picking the same `goalId` again
while that goal is still running keeps the running plan instead of restarting
it. The evaluator finds the brain through the `_brain` tag set by
`createBrain`.

**Persistence.** `goal.snapshot()` returns `{ schema:
'arcade-ai-yuka-goap-plan', version: 1, goalId, plan: actionIds, step,
replans, status }`. `goal.restore(snapshot)` validates it against the
registry (unknown action ids, out-of-range steps, and a different `goalId`
are rejected before anything changes) and resumes from the saved step on the
next update. Restoring calls `terminate()` on a step goal that is already in
flight and no other game code (`sense`, `createGoal`, and `isAvailable` wait
until the plan resumes). The step's Yuka goal is created fresh when the plan
resumes, the same step-level granularity as `restoreFsmState`. `validateGoapPlanSnapshot(value)` validates without
restoring.

**`pursueGoap(goal, steps, sense, { context, maxSteps, stallLimit, onStep?, signal?, maxExpansions? })`**
is the asynchronous, frame-free counterpart of `GoapPlanGoal`, for an actor
whose steps are awaited work rather than goals ticked by `update()` (a test
driver playing a game through its real input, a bot calling a service). Each
`GoapStep` is a `GoapAction` with `run(context): Promise<void>`. It senses,
plans from what it sensed, runs only the plan's first step, and senses again,
so the world decides every move. It resolves `{ reached: true, steps, last }`
once the goal holds, or `{ reached: false, reason, steps, last }` with
`no-plan`, `step-limit` (`maxSteps` taken), `stalled` (`stallLimit` steps
running left the sensed state unchanged) or `aborted` (checked between steps;
a running step is never interrupted). A step that throws rejects it.

### koota (separate entry: `yuka-kit/koota`)

```ts
import { AIBridge, AIState, YukaRef, AIMemory, Intent, EnemyType, BossType } from 'yuka-kit/koota';

const bridge = new AIBridge({ Position, Velocity, Health }); // YOUR game's traits

// per entity, per tick:
bridge.syncFromKoota(vehicle, entity); // physics-corrected position + death check
bridge.setDt(vehicle, dt);
// ... vehicle.update(dt) / brain.execute() via stepAI ...
bridge.syncToKoota(vehicle, entity); // velocity + FSM state name back to koota
```

`YukaRef` is a callback (AoS) trait because yuka objects are stateful class
instances, not POD — this is the load-bearing integration detail the package
standardizes. `AIMemory` (last-seen position/time) and `Intent` (active goal
name) have `rememberSighting`/`writeIntent` helpers on the bridge.

Hearing and per-target memory have matching traits:

- `AIHearing` — the last noise heard: position, time, perceived loudness, and
  kind. Write it with `bridge.rememberNoise(entity, heard)`.
- `AIPerceptionMemory` — a callback trait holding the entity's
  `PerceptionMemory` instance.
- `AIAwareness` — the strongest remembered target: `targetId`, `confidence`,
  last known position and time, and `sense` (`'sight'`, `'hearing'`, or `''`).

`bridge.syncPerceptionMemory(entity, now)` reads the entity's
`PerceptionMemory`, writes the strongest record into `AIAwareness`, and keeps
`AIMemory` and `AIHearing` in step with that record's last sighting and last
noise. Render and animation systems read the traits; the memory stays the
single source of truth.

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm verify       # all of the above plus packed fresh-consumer ESM/CJS/type smoke
```

Before publishing, direct dependencies and peers must be checked against their
current compatible releases. A private package is not feature-complete while
its underlying stack is knowingly behind latest.

`SeededRandom.snapshot()` produces restorable xorshift32 state in the inclusive
range `1..4294967295`. `restore(0)` rejects instead of silently substituting a
different state, so accepted snapshots always restore byte-exactly.
