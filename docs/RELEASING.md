# Release process

`@jbdevprimary/yuka-kit` versions follow [Conventional Commits](https://www.conventionalcommits.org/)
via [release-please](https://github.com/googleapis/release-please). Release
tags omit a `v` (package `0.19.1` uses tag `0.19.1`), matching the historical
tag scheme.

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
   output) checks out that exact tag, installs with a frozen lockfile, runs
   `pnpm verify`, and runs `pnpm publish --access public --provenance
   --no-git-checks`. Authentication is `NPM_TOKEN` (a repository secret) until
   npm Trusted Publishing is configured for this repository, at which point
   the workflow's `id-token: write` permission is sufficient on its own and
   the token requirement drops.

## Local verification

From a clean checkout: `pnpm install --frozen-lockfile && pnpm verify`.
`pnpm verify` runs dependency and workflow checks, typechecking, the coverage
gate, build/package smoke checks, and the Sourcey documentation build.
There is no manual tagging or manual publish step — the only way to cut a
release is merging the release-please PR.

The package declares Node.js `>=24` compatibility. `24.19.0` is the exact CI
and publish toolchain pin, not a claim that earlier Node 24 patch releases are
unsupported.
