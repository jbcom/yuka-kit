---
title: Building game AI
description: Keep game ownership explicit while composing deterministic Yuka Kit primitives.
---

# Building game AI

Create an entity manager per game world rather than using global state. Each
frame, update the game-owned observations first, then call `stepAI` with the
frame delta. This keeps combat FSM updates, steering, and brain arbitration in
a predictable order.

```ts
const manager = createEntityManager();
manage(manager, enemy);

// Refresh target and health observations from the game before stepping AI.
brain.setTargetPosition(enemy, player.position);
brain.setHealthPct(enemy, enemy.health / enemy.maxHealth);
stepAI(manager, deltaSeconds, brainRegistry);
```

Use `TacticalCombatAgent` and `BossTacticalAgent` to decide intents. The game
executes those intents; it remains responsible for damage, spawning, collision,
animation, and presentation. This separation keeps gameplay authored locally
while allowing decision behavior to be tested independently.
