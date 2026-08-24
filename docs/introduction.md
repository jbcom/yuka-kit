---
title: Introduction
description: Deterministic game-AI building blocks built on Yuka.
---

# Yuka Kit

Yuka Kit is a TypeScript package for browser and Node.js games using
[Yuka](https://mugen87.github.io/yuka/). It provides tested, deterministic
building blocks for steering, combat state machines, goal arbitration,
encounters, routines, pathfinding, perception, persistence, and optional
Koota and RPGJS Solo integrations.

The package is deliberately game-engine agnostic. A game owns its entities,
physics, map representation, damage, rendering, and content. Yuka Kit owns
reusable decision primitives and explicit contracts around them. It does not
own a game loop, mutate a global singleton, execute player-facing actions, or
serialize Yuka object graphs.

## Choose a path

- Need an enemy to steer, see, pathfind, or change combat states? Start with
  [Building game AI](../game-ai/).
- Need reproducible encounter rolls, schedules, or save data? Read
  [Persistence and determinism](../persistence/).
- Need an AI decision to cross a trusted command boundary? Use the
  [agent integration contract](../agent-integration/).
- Looking for an export or an integration entry point? Go to the
  [API catalogue](../api-reference/).

## What is included

- Steering and path-following helpers for `Vehicle` instances.
- Combat FSM states and goal-driven tactical agents.
- Grid A* pathfinding and physics-agnostic visibility helpers.
- Deterministic encounters, formations, seeded randomness, and NPC routines.
- Closed-schema snapshot validation before restoration of package state.
- Optional `koota` and RPGJS Solo bridge entry points.

The root entry point is ECS-agnostic. `@jbdevprimary/yuka-kit/koota` and
`@jbdevprimary/yuka-kit/solo` are optional, separately imported entry points,
so games that do not use those frameworks do not pull them into their own
integration path.
