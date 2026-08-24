# Source provenance

This repository restores source ownership for the already-published
`@jbdevprimary/yuka-kit@0.1.0` package before extending it. The published
artifact remains the behavioral baseline:

- SHA-1: `5c65d65e4c20418e11ebfc085241bd2daf0fd051`
- integrity: `sha512-j5w8esauD82xMULuR/+bFg4DVlx8xvYVKICLF0+bKz6wlTR/wicfDpQ4yXGwj/EQIEFJw/0P8IRxRJPJ66eC4A==`

The runtime modules were restored from that exact ESM distribution and the
published declaration files, then made strict-TypeScript clean. The public
root declaration barrel is byte-for-byte compatible with 0.1.0, and the
package verifier exercises ESM and CommonJS entry points.

The implementation was originally extracted and generalized from several
production yuka integrations, then rewritten as a standalone, game-agnostic
toolkit: entity management, combat FSMs, Yuka goal brains, boss phases, a
Koota bridge, reusable steering groups, grid A-star pathfinding, evaluator
vocabulary, a perception-to-FSM seam, and waypoint path following.

Future releases must preserve that provenance and validate their new surfaces
in this source repository before publication.

## 0.19.1 dependency currency

Checked against the public npm registry on 2026-08-09 for the release
candidate:

- `@noble/hashes@2.3.0` is the current release and supports Node.js
  `>=20.19.0`; it provides the audited browser/Node SHA-256 implementation used
  by deterministic identity helpers.
- `yuka@0.7.8`, `koota@0.6.6`, `esbuild@0.28.2`, `typescript@7.0.2`,
  `vite@8.2.1`, `vitest@4.1.10`, and `pnpm@11.21.0` are their current
  releases. Vite is pinned directly so Vitest's compatible transitive range
  cannot leave the verified lockfile behind the release gate.
- `@types/node@24.13.3` is the current Node 24 declaration line. The newer
  package major follows Node 26 and is intentionally outside this Node 24 LTS
  package boundary.
- Node.js 24.19.0 is the current Node 24 LTS release and is pinned as the
  repository execution toolchain in `.nvmrc`, CI, and publication. The package
  preserves its prior public `node >=24` compatibility declaration; the exact
  execution pin is release reproducibility policy, not a narrower consumer
  runtime claim.

The dependency-currency bootstrap recursively checks all public production
dependencies, required peers, and optional peers installed by this repository.
For this release its closed runtime set is `@noble/hashes@2.3.0`, required
peer `yuka@0.7.8`, and installed optional peer `koota@0.6.6`. Noble and Yuka
have no further runtime edges. Koota declares optional React peers, but
neither is installed here, so they are excluded by the documented closure
rule.
