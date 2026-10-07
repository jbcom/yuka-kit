# Migrating from `@jbdevprimary/yuka-kit` to `yuka-kit`

`yuka-kit` is the maintained public package name for this toolkit.
The previous public package, `@jbdevprimary/yuka-kit`, is deprecated on npm
with a pointer to `yuka-kit`. Update the dependency and import specifiers;
the entry points and named exports stay the same.

## Import mapping

| Earlier import | `yuka-kit` import |
| --- | --- |
| `@jbdevprimary/yuka-kit` | `yuka-kit` |
| `@jbdevprimary/yuka-kit/goap` | `yuka-kit/goap` |
| `@jbdevprimary/yuka-kit/koota` | `yuka-kit/koota` |
| `@jbdevprimary/yuka-kit/solo` | `yuka-kit/solo` |
| `@jbdevprimary/yuka-kit/package.json` | `yuka-kit/package.json` |

Replace the package name while keeping the entry-point suffix and named imports.
The same mapping applies to CommonJS `require()` calls. For example:

```ts
import { createVehicle, EncounterDirector, type EncounterTableEntry } from 'yuka-kit';
import { SoloCommandAdapter } from 'yuka-kit/solo';
```

## Steps

1. Replace the dependency:

   ```sh
   pnpm remove @jbdevprimary/yuka-kit
   pnpm add yuka-kit yuka@0.7.8
   ```

   If you use `yuka-kit/koota`, also run `pnpm add koota@0.6.6` for its
   optional peer. Commit the updated dependency manifest and lockfile together.
2. Rewrite import specifiers with the table above (a find-and-replace on the
   package name is sufficient).
3. Install from the public npm registry, where `yuka-kit` is available.
4. Update any bundler rule that names the earlier package, for example a
   manual-chunk pattern becomes `node_modules/yuka-kit/`.
5. Update module aliases and filesystem snapshot paths that contain the old
   dependency directory. For example,
   `node_modules/@jbdevprimary/yuka-kit/` becomes `node_modules/yuka-kit/`.
6. Persisted data needs no migration for the package rename. Snapshot schema
   tags and deterministic identity prefixes are unchanged. Keep existing save
   tags and snapshot contents unchanged; updating a filesystem path does not
   require rewriting saved data.
7. Run your project's typecheck and tests against `yuka-kit`.

## Versions

Deprecation does not remove `@jbdevprimary/yuka-kit` from npm. Existing
lockfiles can still install the previous public package while projects migrate.
