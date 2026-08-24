---
title: Persistence
description: Validate untrusted snapshots before restoring deterministic package state.
---

# Persistence and determinism

Snapshots are a security and compatibility boundary. Validate data from saves,
network storage, or older clients before mutating live state:

```ts
import { validateEncounterDirectorSnapshot } from '@jbdevprimary/yuka-kit';

const snapshot = validateEncounterDirectorSnapshot(untrustedJson);
director.restore(snapshot);
```

The package uses closed schemas for encounter, routine, and FSM snapshots.
Their retained collections are bounded to protect the running game from
unbounded data. Persist only the returned snapshot objects; do not serialize
Yuka class instances directly.
