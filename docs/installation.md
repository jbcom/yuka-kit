---
title: Installation
description: Install the package and its required or optional peer dependencies.
---

# Installation

Yuka Kit supports Node.js 24 and newer. The published package is ESM-first,
but its root, Koota, and Solo entry points also have CommonJS exports and
declarations for consumers that use `require()`.

```sh
pnpm add yuka-kit yuka
```

`yuka` is a required peer dependency. Install `koota` only when using the
optional Koota bridge:

```sh
pnpm add koota
```

Import from the root entry point for engine-agnostic modules, from
`yuka-kit/goap` for goal-oriented action planning, or from
`yuka-kit/koota` and `yuka-kit/solo` for those
optional integrations. Do not import internal `src/` paths: only the four
documented package exports are public contracts.

```ts
import { createVehicle, createEntityManager, manage, stepAI } from 'yuka-kit';

const manager = createEntityManager();
const actor = createVehicle({ speed: 3 });
manage(manager, actor);
stepAI(manager, 1 / 60);
```

Yuka itself has no bundled TypeScript declarations. Yuka Kit carries the
ambient declaration needed by its public types, so consumers should not add a
second local `declare module 'yuka'` shim.
