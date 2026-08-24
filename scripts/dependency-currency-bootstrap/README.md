# Dependency-currency oracle

This directory enforces the rule that this package cannot ship behind the
live public runtime packages beneath it. It walks production dependencies,
required peers, and optional peers that are actually installed by this
repository, then fails unless every declared range selects the public npm
`latest` version.

It runs as `verify:dependency-currency`, part of `pnpm verify` (see
`docs/RELEASING.md`), keeping the check isolated behind one package script
rather than duplicated across the repository.
