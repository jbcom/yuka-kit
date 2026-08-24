---
title: Architecture and ownership
description: The deliberate boundaries that make Yuka Kit deterministic, composable, and safe to integrate.
---

# Architecture and ownership

Yuka Kit is a decision library, not a game framework. Its design keeps every
important authority boundary explicit.

| Layer | Yuka Kit owns | Your game owns |
| --- | --- | --- |
| World lifecycle | Per-world helpers and registries | Scene creation, disposal, entity identity |
| Decisions | Steering, FSM transitions, evaluator arbitration, intents | Input observations and acceptance rules |
| Simulation | Deterministic utilities and state snapshots | Physics, navigation meshes, damage, animation, rendering |
| Persistence | Closed-schema validation and snapshots | Storage, migration policy, save/load orchestration |
| Commands | Typed proposal and envelope validation | Authorization, side effects, network dispatch |

## One world, explicit lifecycle

Create `EntityManager` and `BrainRegistry` instances per world. Register an
entity only in the world that will step it. On a scene transition, remove
entities and call `BrainRegistry.reset()` rather than retaining module-level
state. This makes test worlds, multiplayer rooms, and reloads independent.

## Deterministic inputs, authored outcomes

Supply observations from authoritative game state: positions, health,
cooldowns, map tags, and action availability. The library turns those inputs
into state transitions, encounter plans, routine decisions, or intents. Your
game decides whether and how an intent succeeds. That separation means an
unsuccessful action cannot be silently treated as completed.

## Coordinate convention

Yuka's 2D convention still uses `Vector3`; keep `y` at `0` and use `x` / `z`
for the ground plane. `astar()` is the exception: it consumes a rectangular
`grid[y][x]` with `0` as walkable and returns `[x, y]` cells.

## Public surface

Only these package entry points are supported:

```ts
import {} from '@jbdevprimary/yuka-kit';
import {} from '@jbdevprimary/yuka-kit/koota';
import {} from '@jbdevprimary/yuka-kit/solo';
```

The root is framework-agnostic. Koota is optional; Solo is an adapter boundary
for RPGJS command dispatch. Internal file paths and the package build layout
are intentionally not stable API.
