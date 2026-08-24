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
reusable decision primitives and explicit contracts around them.

## What is included

- Steering and path-following helpers for `Vehicle` instances.
- Combat FSM states and goal-driven tactical agents.
- Grid A* pathfinding and physics-agnostic visibility helpers.
- Deterministic encounters, formations, seeded randomness, and NPC routines.
- Closed-schema snapshot validation before restoration of package state.
- Optional `koota` and RPGJS Solo bridge entry points.

For the full exported API, start from the package [README](https://github.com/jbcom/yuka-kit#modules), which remains the concise package reference.
