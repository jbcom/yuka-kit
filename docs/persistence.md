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

The package uses closed schemas for encounter, routine, FSM, perception
memory, and GOAP plan snapshots. Their retained collections are bounded to
protect the running game from unbounded data. A GOAP plan snapshot stores
action ids, so restore it into a `GoapPlanGoal` built with a registry that
still holds those actions; unknown ids are rejected before anything changes. Persist only the returned snapshot objects; do not serialize
Yuka class instances directly.
