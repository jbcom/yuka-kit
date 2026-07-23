# @arcade-cabinet/ai-yuka

Shared game-AI toolkit wrapping [yuka.js](https://mugen87.github.io/yuka/) for
the arcade-cabinet fleet: steering helpers, combat FSM states, goal-driven
`Think` brains with phase-aware boss AI, grid A\* pathfinding, physics-agnostic
vision perception, deterministic encounter spawning, authored NPC routines,
class-specific playthrough governors, and optional Koota/RPGJS Solo bridges.

This Gitea repository is the source of truth for the private package. Version
`0.1.0` restored the originally published artifact; `0.2.0` added the production
systems needed by RPGJS Solo games, `0.3.0` added structured combat bindings,
`0.4.0` added authoritative command-availability observations, `0.7.0`
added versioned routine and combat-FSM state, `0.8.0` added actionable
Yuka-arbitrated combat tactics, and `0.14.0` makes Mage pack defense react to
every nearby telegraph. All releases
target Node.js 24 LTS and pin the current underlying Yuka release.

Extracted from **bok** (winner of the ai-yuka tournament — the deepest yuka
integration in the fleet and the only repo that had already solved yuka-objects-
inside-koota-traits), absorbing:

- **pond-warfare** — flocking/separation/obstacle-avoidance steering helpers
- **goats-in-hell** — binary-heap grid A\* + the goal/evaluator vocabulary
- **aethermoor** — the raycast-perception → FSM pattern
- **voxel-realms** — waypoint path-following defaults

## Install

```sh
pnpm add @arcade-cabinet/ai-yuka yuka
# koota only if you use the ECS bridge:
pnpm add koota
```

`yuka` (`0.7.8`) is an exact peer dependency. `koota` is an **optional** peer — only
needed for the `@arcade-cabinet/ai-yuka/koota` entry point.

yuka ships no TypeScript types; this package bundles an ambient
`declare module 'yuka'` that consumers get transitively. If your repo has its
own local `yuka.d.ts`, delete it when adopting this package.

## Modules

Everything except `koota/` is ECS-agnostic and operates on plain yuka
`Vehicle`/`GameEntity` objects. 2D games follow yuka's own convention: use
`Vector3` with `y` pinned to 0 — there is no separate 2D API.

### core

```ts
import { createVehicle, createCombatVehicle, createEntityManager, manage, stepAI } from '@arcade-cabinet/ai-yuka';

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

`PatrolState`, `ChaseState`, `AttackState`, `DeadState`, `FleeState` — bok's
combat states, parameterized (ranges, cooldowns, and transition state ids are
constructor options; targets injected via `setTarget`). `createFsm(vehicle,
states, initial)` wires a StateMachine; `getStateName(fsm)` resolves the
current state's registration id.

`snapshotFsmState()` / `restoreFsmState()` persist only that registered state
id, keeping Yuka class instances out of save data while resuming patrol,
chase, attack, or dead behavior through the existing machine.

Time-based states read frame dt from the vehicle. `stepAI()` writes it and
updates every managed combat FSM before steering; custom loops can call
`setDt(vehicle, dt)` directly (the Koota `AIBridge` exposes the same helper).

### steering

- `addBaseBehaviors(vehicle, obstacles, weights?)` — separation + obstacle avoidance
- `addFlockingBehaviors(vehicle, weights?)` — alignment + cohesion
- `clearDirectionalBehaviors(vehicle)` — drops seek/flee/pursuit/wander, keeps group behaviors
- one-liners: `seek`, `flee`, `arrive`, `pursuit`, `evade`, `wander` (add + return the behavior)
- `followWaypoints(vehicle, waypoints, options?)` — Path + FollowPathBehavior +
  OnPathBehavior with voxel-realms' tuned defaults; returns a handle with
  `finished()`/`clear()`. Note yuka's `finished()` flips true when the index
  *reaches* the final waypoint (still traveling to it).

### goals

- Entity-tag evaluators (bok style — the game loop refreshes
  `setTargetPosition(entity, pos)` / `setHealthPct(entity, pct)` each frame):
  `ChaseEvaluator`, `MeleeAttackEvaluator`, `KeepDistanceEvaluator`,
  `WanderEvaluator`, `FleeEvaluator`.
- Getter-injected evaluators (goats-in-hell style):
  `AggressionEvaluator`, `SurvivalEvaluator`, `BossPhaseEvaluator`.
- `createBrain(entity, evaluators)` — Think + `_brain` back-reference tag.
- `BrainRegistry` — per-world brain lifecycle (register/unregister/updateAll/reset).
- `BossBrain` / `createBossBrain(entity, phases)` — phase-aware boss Think:
  health thresholds advance phases (never regress), evaluator biases shift per
  phase, winning evaluator tags `_activeBehavior`
  (`circle-strafe` / `aggressive-chase` / `retreat-and-summon` /
  `ranged-barrage` / `enrage`). `BossPhaseConfig` is a structural subset of the
  fleet's boss content schemas.

### presets

`AI_TYPE_PRESETS` maps the fleet archetypes
(`melee`/`ranged`/`pack`/`ambush`/`boss`/`passive`) to evaluator bundles;
`createBrainForType(entity, aiType, bossPhases?)` builds the brain (boss +
phases ⇒ full `BossBrain`). Games keep their own content-id → AIType lookup
(like bok's `ENEMY_AI_TYPES`).

### combat tactics

`TacticalCombatAgent` turns melee, ranged, charge, and ambush observations
into command-neutral `AgentIntent`s through Yuka `Think`/`GoalEvaluator`
arbitration. Detection, attack bands, survival retreat, cooldown readiness,
and each game's action payloads remain explicit inputs. The behavior model is
extracted from A Good Old-Fashioned Adventure's authored enemy loop rather
than duplicating that loop in every game.

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
- `applyPerception(seen, fsm, stateWhenSeen)` — the aethermoor raycast→FSM
  pattern: transition once on sighting.

### encounters

`EncounterDirector` consumes monotonic player movement steps rather than frame
time. It combines safe-zone and content eligibility gates, cooldowns, pity
pressure, recent-repeat suppression, a serializable seeded PRNG, and actual
Yuka `Think`/`GoalEvaluator` weighted arbitration. A successful decision
returns a spawn plan; the game remains responsible for creating its authored
entities.

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

Knight adapters bind both `knightBlock` and `knightUnblock`; the latter should
map to the engine's public guard action with `{ active: false }`. Observing
`actor.guarding` lets the governor hold that guard through the complete enemy
startup telegraph, then release it through the public action before resuming
movement.

### RPGJS Solo (separate entry: `@arcade-cabinet/ai-yuka/solo`)

`SoloCommandAdapter` maps the Yuka XZ plane to RPGJS Solo XY commands and
forces `source: 'ai'`. `runGovernedPlaythrough()` repeatedly observes the real
game, arbitrates through the selected class brain, dispatches through the same
public command boundary as keyboard input, advances the normal game tick, and
fails on rejected commands, stalls, or step limits. It never teleports or
writes runtime state directly.

```ts
import { ClassGovernor } from '@arcade-cabinet/ai-yuka';
import { SoloCommandAdapter, runGovernedPlaythrough } from '@arcade-cabinet/ai-yuka/solo';

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

### koota (separate entry: `@arcade-cabinet/ai-yuka/koota`)

```ts
import { AIBridge, AIState, YukaRef, AIMemory, Intent, EnemyType, BossType } from '@arcade-cabinet/ai-yuka/koota';

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

## Development

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm verify       # all of the above plus ESM/CommonJS package smoke
```

Before publishing, direct dependencies and peers must be checked against their
current compatible releases. A private package is not feature-complete while
its underlying stack is knowingly behind latest.
