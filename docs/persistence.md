---
title: Persistence
description: Validate untrusted snapshots before restoring deterministic package state.
---

# Persistence and determinism

Snapshots are a security and compatibility boundary. Validate data from saves,
network storage, or older clients before mutating live state:

```ts
import { validateEncounterDirectorSnapshot } from 'yuka-kit';

const snapshot = validateEncounterDirectorSnapshot(untrustedJson);
director.restore(snapshot);
```

The package uses closed schemas for encounter, routine, FSM, perception
memory, and GOAP plan snapshots. Their retained collections are bounded to
protect the running game from unbounded data. A GOAP plan snapshot stores
action ids, so restore it into a `GoapPlanGoal` built with a registry that
still holds those actions; unknown ids are rejected before anything changes. Persist only the returned snapshot objects; do not serialize
Yuka class instances directly.

Each snapshot carries a `schema` tag (for example `arcade-ai-yuka-encounters`)
and a `version`. The tags are stable wire identifiers: they were fixed before
the package took the name `yuka-kit` and are deliberately never renamed, so
snapshots written by any earlier release keep validating. Treat them as opaque
strings.
