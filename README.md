# @arcade-cabinet/ai-yuka

Shared game-AI toolkit wrapping [yuka.js](https://mugen87.github.io/yuka/) for
the arcade-cabinet fleet: steering helpers, combat FSM states, goal-driven
`Think` brains with phase-aware boss AI, grid A\* pathfinding, physics-agnostic
vision perception, and a koota ECS bridge.

This Gitea repository is the source of truth for the private package. Version
`0.1.0` is a source-restored representation of the already-published package;
its behavior is held by API and package smoke tests before feature work lands.
All releases target Node.js 24 LTS and pin the current underlying Yuka release.

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

`yuka` (`^0.7.8`) is a peer dependency. `koota` is an **optional** peer — only
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
stepAI(manager, dt, brainRegistry); // steering first, then goal arbitration
```

### fsm

`PatrolState`, `ChaseState`, `AttackState`, `DeadState`, `FleeState` — bok's
combat states, parameterized (ranges, cooldowns, and transition state ids are
constructor options; targets injected via `setTarget`). `createFsm(vehicle,
states, initial)` wires a StateMachine; `getStateName(fsm)` resolves the
current state's registration id.

Time-based states read frame dt from the vehicle: call `setDt(vehicle, dt)`
each tick (the koota `AIBridge` exposes the same helper).

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

### pathfinding

`astar(grid, sx, sy, ex, ey)` — octile-heuristic, binary-min-heap A\* over
`grid[y][x] === 0` walkability with corner-cut prevention. Returns `[x, y]`
cells start→end inclusive, `[]` when unreachable.

### perception

- `createVisionSensor(raycastFn, { range, isTarget })` — line-of-sight over any
  physics engine (Rapier, cannon, custom) via an adapter function.
- `inVisionCone(origin, forward, target, range, halfAngleRad)` — pure-math cone test.
- `applyPerception(seen, fsm, stateWhenSeen)` — the aethermoor raycast→FSM
  pattern: transition once on sighting.

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
pnpm --filter @arcade-cabinet/ai-yuka test       # vitest, node env
pnpm --filter @arcade-cabinet/ai-yuka typecheck
pnpm --filter @arcade-cabinet/ai-yuka build      # dist/esm + dist/cjs + type fixups
```
