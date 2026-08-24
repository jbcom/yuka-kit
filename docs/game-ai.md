---
title: Building game AI
description: Keep game ownership explicit while composing deterministic Yuka Kit primitives.
---

# Building game AI

Create an entity manager and brain registry per game world rather than using
global state. Each frame, update the game-owned observations first, then call
`stepAI` with the frame delta. This keeps combat FSM updates, steering, and
brain arbitration in a predictable order.

```ts
import {
  BrainRegistry,
  ChaseEvaluator,
  createBrain,
  createCombatVehicle,
  createEntityManager,
  createVehicle,
  manage,
  setHealthPct,
  setTargetPosition,
  stepAI,
} from '@jbdevprimary/yuka-kit';

const manager = createEntityManager();
const brains = new BrainRegistry();
const player = createVehicle({ speed: 4 });
const enemy = createCombatVehicle({ speed: 3 }, { target: player });
const brain = createBrain(enemy, [new ChaseEvaluator()]);
manage(manager, enemy);
brains.register('goblin-01', brain);

// Refresh target and health observations from the game before stepping AI.
setTargetPosition(enemy, player.position);
setHealthPct(enemy, enemy.health / enemy.maxHealth);
stepAI(manager, deltaSeconds, brains);
```

Use `TacticalCombatAgent` and `BossTacticalAgent` to decide intents. The game
executes those intents; it remains responsible for damage, spawning, collision,
animation, and presentation. This separation keeps gameplay authored locally
while allowing decision behavior to be tested independently.

## Intent boundary

`TacticalCombatAgent` and `BossTacticalAgent` return command-neutral
`AgentIntent` values such as `move-to`, `move-away`, `action`, `transfer-map`,
`stop`, and `wait`. Treat that return value as a proposal, validate it in your
game's authority layer, then execute it there. The library never applies
damage, spawns an actor, changes a map, or plays an animation on its own.
