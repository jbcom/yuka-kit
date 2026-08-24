---
title: Installation
description: Install the package and its required or optional peer dependencies.
---

# Installation

Yuka Kit supports Node.js 24 and newer. Use pnpm through Corepack so the
package manager matches the repository toolchain.

```sh
pnpm add @jbdevprimary/yuka-kit yuka
```

`yuka` is a required peer dependency. Install `koota` only when using the
optional Koota bridge:

```sh
pnpm add koota
```

Import from the root entry point for engine-agnostic modules, or from
`@jbdevprimary/yuka-kit/koota` and `@jbdevprimary/yuka-kit/solo` for those
optional integrations.

```ts
import { createVehicle, createEntityManager, manage, stepAI } from '@jbdevprimary/yuka-kit';

const manager = createEntityManager();
const actor = createVehicle({ speed: 3 });
manage(manager, actor);
stepAI(manager, 1 / 60);
```
