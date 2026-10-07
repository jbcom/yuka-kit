# Yuka Kit

Preserve runtime behavior and the public API when changing repository policy.

## Compatibility

Support maintained Node.js lines 22, 24 and 26 with `engines.node: >=22`.
Use major-only Node selectors in CI and `.nvmrc`; never require one exact patch.
Run every `pnpm verify` step on Node 22 and 26 before proposing policy changes.
Packed consumers must import every shipped entry point in ESM and CommonJS.

## Validation

Install with `pnpm install --frozen-lockfile`. Run `pre-commit run --all-files`
and retain the pre-commit and commit-msg hooks. Use Conventional Commits.
CI / gate aggregates every other CI job and rejects failures or cancellations.

The branch ruleset script defaults to this repository and the standard aggregate
checks. It applies repository-owned rules only; inherited organization rules
must remain untouched. Do not add Copilot review or Code Quality rules.
