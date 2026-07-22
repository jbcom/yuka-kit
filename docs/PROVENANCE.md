# Source provenance

This repository restores source ownership for the already-published
`@arcade-cabinet/ai-yuka@0.1.0` package before extending it. The published
artifact remains the behavioral baseline:

- SHA-1: `5c65d65e4c20418e11ebfc085241bd2daf0fd051`
- integrity: `sha512-j5w8esauD82xMULuR/+bFg4DVlx8xvYVKICLF0+bKz6wlTR/wicfDpQ4yXGwj/EQIEFJw/0P8IRxRJPJ66eC4A==`
- registry: the private `arcade-cabinet` Gitea npm scope

The runtime modules were restored from that exact ESM distribution and the
published declaration files, then made strict-TypeScript clean. The public
root declaration barrel is byte-for-byte compatible with 0.1.0, and the
package verifier exercises ESM and CommonJS entry points.

The implementation was originally extracted through the fleet tournament in
`arcade-cabinet/meta/tournaments/ai-yuka.md`:

- `bok`: entity management, combat FSMs, Yuka goal brains, boss phases, and
  the Koota bridge
- `pond-warfare`: reusable steering groups
- `goats-in-hell`: grid A-star and evaluator vocabulary
- `aethermoor`: perception-to-FSM seam
- `voxel-realms`: waypoint path following

Future releases must preserve that provenance, validate their new surfaces in
this source repository, and publish only after every direct underlying package
is aligned to its current compatible release.
