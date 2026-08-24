---
title: Releasing
description: Release Please owns versions, changelog generation, releases, and npm publication.
---

# Releasing

Use Conventional Commits for changes to `main`. Release Please derives the
next version, changelog, tag, and GitHub Release from those commits.

Normal changes run the full verification suite before merge. A release-please
pull request is an encapsulation of already-merged, verified changes. It is
created with the organization release token so it triggers the protected
checks, and trusted automation enables merge-commit auto-merge only after they
pass. The release workflow then publishes only after a real release tag exists
and verifies the tagged package before npm publication with provenance.

See the repository's [release process](https://github.com/jbcom/yuka-kit/blob/main/docs/RELEASING.md)
for the operational details.
