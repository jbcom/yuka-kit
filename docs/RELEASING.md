# Release process

The first public publication is complete: `yuka-kit@1.0.0` is on npm.
Every subsequent release publishes from `.github/workflows/cd.yml` using
npm trusted publishing (OIDC) with provenance. No npm token is used.

## How a release happens

1. Merge Conventional Commits through a normal pull request. CI runs the full
   `pnpm verify` suite on Node.js 22, 24 and 26 and runs pre-commit.
   The `CI / gate` check requires every CI job to succeed.
2. `release.yml` runs release-please only. It proposes the version, manifest
   and changelog update. After that PR merges, it creates the GitHub release
   and version tag. Tags omit a `v`.
3. Release records the created tag and tagged SHA in a small run artifact.
   `cd.yml` receives completion of the trusted Release workflow on `main`,
   reads that artifact from the exact run, checks out its tag and verifies
   the tagged SHA. The release commit can predate the run that created it.
   A run without a created-release artifact skips publication visibly.
4. The publish job installs with a frozen lockfile and runs `pnpm verify`.
   It checks the public registry and skips a version that already exists,
   verifying its identity and artifact integrity. An E404 for the version
   permits publication; other registry failures fail closed.
5. `npm publish --access public --provenance` uses the job's
   `id-token: write` permission. The npm trusted publisher is configured for
   repository `jbcom/yuka-kit`, workflow **`cd.yml`**.
   An anonymous registry lookup retries for propagation and verifies the
   published artifact. Maintainers do not tag or publish manually.

## Documentation

On successful CI completion on `main`, the separate CD deploy job checks out
that exact CI commit, builds Sourcey and deploys `docs/dist` to GitHub Pages.
Publication and documentation have separate job permissions.

## Local verification

Run `pnpm install --frozen-lockfile`, `pnpm verify` and
`pre-commit run --all-files`. Install both Git hooks with
`pre-commit install --hook-type pre-commit --hook-type commit-msg`.

The package supports Node.js `>=22`; CI covers each non-EOL major (22/24/26).
`.nvmrc` selects major 26 for local development and publishing, allowing patch
updates without an exact Node pin. The verification suite retains dependency
checks, workflow mutation tests, typechecking, coverage, builds, packed ESM/CJS
consumer smoke tests, publint, export/type resolution and the Sourcey build.

Branch policy tooling lives in `scripts/apply-branch-ruleset.mjs`. Its defaults
are this repository and the four checks `CI / gate`, `title`,
  `Repository Policy / gate` and `Dependency Review / gate`.

Repository Actions policy requires SHA pinning. Its third-party allowlist must
include the exact pinned release-please, pnpm setup and semantic PR title actions
used by these workflows; GitHub-owned actions remain allowed.
