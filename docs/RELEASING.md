# Release process

`yuka-kit` versions follow [Conventional Commits](https://www.conventionalcommits.org/)
via [release-please](https://github.com/googleapis/release-please). Release
tags omit a `v` (version `X.Y.Z` is tagged `X.Y.Z`).

## How a release happens

1. Merge Conventional Commits (`feat:`, `fix:`, etc.) to `main` through a
   normal pull request. CI (`.github/workflows/ci.yml`) must pass first:
   `pnpm install --frozen-lockfile`, a lockfile-sync check, typechecking, the
   enforced coverage suite, package builds, Sourcey build, and package
   consumability checks on Node.js `24.19.0` (pinned in `.nvmrc`) with pnpm
   via Corepack.
2. On push to `main`, `.github/workflows/release.yml` runs
   `googleapis/release-please-action`. If unreleased commits exist, it opens
   or updates a release PR that bumps `package.json` and
   `.release-please-manifest.json` and updates `CHANGELOG.md`.
3. The release PR is a mechanically generated encapsulation of commits that
   already passed the normal CI gate. The `CI_GITHUB_TOKEN` is used by Release
   Please to create an update that triggers the protected checks; the trusted
   `.github/workflows/automerge.yml` then enables merge-commit auto-merge only
   for that same-repository release branch. Merging it triggers the workflow
   again, and this time release-please creates the GitHub Release and matching
   tag.
4. The workflow's `publish` job (gated on `release-please`'s `released`
   output) checks out that exact tag and first checks the registry: a version
   that is already on npm is skipped (never published twice), and a package
   that does not exist on npm yet is a warned skip (see "First publication"
   below). Otherwise it installs with a frozen lockfile, runs `pnpm verify`,
   and runs `pnpm publish --access public --provenance --no-git-checks`. It
   then checks the exact version anonymously through the public npm registry,
   retrying briefly for registry propagation. Authentication is `NPM_TOKEN` (a
   repository secret) until npm Trusted Publishing is configured for this
   repository, at which point the workflow's `id-token: write` permission is
   sufficient on its own and the token requirement drops.

## First publication

npm cannot attach a trusted publisher to a package name that does not exist
yet, so the first version of a new name is published by hand, once, from a
clean checkout of its release tag, without provenance (provenance needs the CI
identity). Then configure the trusted publisher (repository `jbcom/yuka-kit`,
workflow `release.yml`) on npmjs.com; every later release publishes from CI
with provenance. Until the package exists, the workflow's publish job logs a
`::warning::` and skips rather than failing.

Before that one-time publication, install and verify from the clean release-tag
checkout to generate every runtime and type entry point in `dist/`:

```sh
pnpm install --frozen-lockfile
pnpm verify
npm publish --registry=https://registry.npmjs.org --access public --provenance=false
```

The explicit `--provenance=false` overrides the repository's provenance defaults
for this local bootstrap only. Authenticate using the maintainer's local npm
configuration; subsequent releases use the CI identity and provenance.

## Local verification

From a clean checkout: `pnpm install --frozen-lockfile && pnpm verify`.
`pnpm verify` runs dependency and workflow checks, typechecking, the coverage
gate, build/package smoke checks, and the Sourcey documentation build.
Except for the one-time first publication of a new package name described
above, there is no manual tagging or manual publish step. Subsequent releases
are cut by merging the release-please PR and published from CI.

The package declares Node.js `>=24` compatibility. `24.19.0` is the exact CI
and publish toolchain pin, not a claim that earlier Node 24 patch releases are
unsupported.
