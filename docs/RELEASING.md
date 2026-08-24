# Immutable package release

`@jbdevprimary/yuka-kit` versions and release tags are immutable. Historical
tags omit a `v`, so the package version and annotated tag must match exactly
(for example, package `0.19.1` uses tag `0.19.1`).

## Candidate gate

1. Replace the temporary dependency-currency bootstrap with the exact released
   `@arcade-cabinet/build-preset` CLI before merge or publication.
2. Land an active pull request whose exact head passes Gitea CI under Node.js
   24.19.0 and pnpm 11.21.0.
3. Verify the merged commit is exactly the remote `main` tip. From that clean
   merged tree run the frozen install, `pnpm verify`, and `npm pack --dry-run`.
4. Pack exactly one tarball. Record its SHA-256 and the SHA-256 of its
   uncompressed tar stream. Create an annotated `0.19.1` tag that peels to the
   verified merged commit, record the annotated tag-object SHA, and push that
   exact tag.

## Trusted publication

Manually dispatch `Publish tagged package` with the tag, annotated tag-object
SHA, peeled commit, packed SHA-256, and uncompressed-tar SHA-256. The workflow
keeps checkout credentials unpersisted and uses the built-in `GITEA_TOKEN`,
scoped only to each proof step with `contents: read`, to query the authenticated
Branch API. It requires live remote `main` to equal the exact checked-out
release commit—not merely an ancestor—before verification. It repeats the live
Branch API, tag-object, peeled-commit, HEAD, and clean-tree equality immediately
before the irreversible publish.

The Doppler-backed `PRIVATE_NPM_PUBLISH_TOKEN` is written to a mode-600
`RUNNER_TEMP` npm configuration, is never passed in process arguments or saved
with `pnpm config`, and is removed by an exit/signal trap. Publication reads
that temporary file through `NPM_CONFIG_USERCONFIG` and disables lifecycle
scripts. Both `PRIVATE_NPM_PUBLISH_TOKEN` and the step-scoped `GITEA_TOKEN` are
explicitly unset before the pnpm child process starts; only the temporary npm
configuration path crosses that process boundary.

The workflow then discards authenticated npm configuration, reads package
metadata anonymously, downloads and byte-compares the registry tarball, and
installs the exact version in clean root, Solo, and Koota ESM/CommonJS and
TypeScript consumers. Only after those checks pass does a separate minimal job,
with no checkout and no npm credential, receive its own step-scoped
`GITEA_TOKEN` with `contents: write`. It verifies the live annotated tag object
and peeled commit, queries the live `main` branch again and requires exact
commit equality, then creates or validates the Gitea Release. The Release
records the exact tag, tag-object SHA, commit, compressed digest, uncompressed
digest, and registry tarball URL. This final equality also closes the retry
path when the package bytes already exist but `main` has advanced.

Neither credential may substitute for the other: missing package authorization
or missing repository-release authorization fails the workflow closed.

The workflow is retry-safe: if the exact package version already exists, its
downloaded bytes must match the expected digest and packed candidate before
the workflow proceeds. It never overwrites an existing package version or
silently moves a mismatched release.

The package continues to declare Node.js `>=24` compatibility. Node.js 24.19.0
is the exact repository verification/publication toolchain; it is not a claim
that consumers on earlier Node 24 patch releases are unsupported.
