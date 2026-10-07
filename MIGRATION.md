# Migrating to `yuka-kit`

`yuka-kit` is the one maintained home of this toolkit. Three earlier package
names resolve to it, and the API did not change shape: every export of the
earlier packages exists under the same name on the same entry point. Migration
is a rename of the import specifier and the dependency.

## Import mapping

| Earlier import | `yuka-kit` import |
| --- | --- |
| `@arcade-cabinet/ai-yuka` | `yuka-kit` |
| `@arcade-cabinet/ai-yuka/koota` | `yuka-kit/koota` |
| `@arcade-cabinet/ai-yuka/solo` | `yuka-kit/solo` |
| `@arcade-cabinet/ai-yuka/package.json` | `yuka-kit/package.json` |
| `@arcade-cabinet/yuka-kit` (any entry point) | `yuka-kit` (same entry point) |
| `@jbdevprimary/yuka-kit` | `yuka-kit` |
| `@jbdevprimary/yuka-kit/goap` | `yuka-kit/goap` |
| `@jbdevprimary/yuka-kit/koota` | `yuka-kit/koota` |
| `@jbdevprimary/yuka-kit/solo` | `yuka-kit/solo` |

Named imports stay exactly as they are. For example:

```ts
// before
import { createVehicle, EncounterDirector, type EncounterTableEntry } from '@arcade-cabinet/ai-yuka';
import { SoloCommandAdapter } from '@arcade-cabinet/ai-yuka/solo';

// after
import { createVehicle, EncounterDirector, type EncounterTableEntry } from 'yuka-kit';
import { SoloCommandAdapter } from 'yuka-kit/solo';
```

### Coverage of the earlier `ai-yuka` 0.19 line

| Entry point | Runtime exports | Status |
| --- | --- | --- |
| `.` | 84 | all present in `yuka-kit`, same names |
| `./koota` | 7 | all present in `yuka-kit/koota`, same names |
| `./solo` | 9 | all present in `yuka-kit/solo`, same names |

The exported TypeScript types match too: comparing the built declaration
barrels of both packages found no type missing from `yuka-kit`.
`src/migration-surface.test.ts` freezes the runtime export names and fails if
one disappears. The earlier package's own test suite (11 files, 104 tests) also
runs green against this package's source.

## Steps

1. Replace the dependency: remove the earlier package and run
   `pnpm add yuka-kit yuka` (`yuka` is an exact peer; add `koota` only for the
   `yuka-kit/koota` entry point).
2. Rewrite import specifiers with the table above (a find-and-replace on the
   package name is sufficient).
3. If the project configured the earlier scope on a private registry (a
   scoped `.npmrc` line, a lockfile registry override), remove it: `yuka-kit`
   installs from the public npm registry.
4. Update any bundler rule that names the package, for example a manual-chunk
   pattern matching `node_modules/@arcade-cabinet/ai-yuka/` becomes
   `node_modules/yuka-kit/`.
5. Delete any local `declare module 'yuka'` shim that only existed to cover
   gaps in the earlier declarations; `yuka-kit` ships a merged ambient
   declaration.
6. Persisted data needs no migration. Snapshot `schema` tags such as
   `arcade-ai-yuka-encounters` and the deterministic identity prefix are wire
   identifiers that did not change, so saves written by any earlier release
   still validate. Do not rewrite them.

## What `yuka-kit` adds

Code on the earlier `ai-yuka` line gains these without any change:

- `yuka-kit/goap`: a deterministic goal-oriented action planner, an action
  registry, and an executor that runs plans as Yuka goals.
- Hearing: `createHearingSensor`, `NoiseBuffer`, `perceiveNoise`,
  `attenuateNoise`, `validateNoiseEvent`.
- Light-scaled vision: `lightScaledRange`, `inLitVisionCone`,
  `createLitVisionSensor`.
- Per-target perception memory: `PerceptionMemory` and
  `validatePerceptionMemorySnapshot`.
- Koota traits `AIHearing`, `AIAwareness`, `AIPerceptionMemory`, and the
  `AIBridge` methods `rememberNoise` and `syncPerceptionMemory`.

## Versions

`yuka-kit` continues the version line of `@jbdevprimary/yuka-kit`. The first
`yuka-kit` release is the name change; every version of the earlier names is
deprecated with a pointer here and none is unpublished, so existing lockfiles
keep installing while they migrate.
