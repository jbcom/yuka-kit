# Changelog

## [0.20.0](https://github.com/jbcom/yuka-kit/compare/0.19.1...0.20.0) (2026-08-24)


### Features

* add deterministic proposal dispatch protocol ([e4b9b41](https://github.com/jbcom/yuka-kit/commit/e4b9b41f9a22e1afaa5152e51470b6bd759bcbbf))
* add per-map encounter budgets ([4de92be](https://github.com/jbcom/yuka-kit/commit/4de92be14b4bf5b74e38dc73cb76eaf88ed1e6a7))
* add Solo AI production systems ([5c0aeeb](https://github.com/jbcom/yuka-kit/commit/5c0aeebeb313b62c3b003158eb571cf924dcaf24))
* add state-aware NPC routines ([cebd4b3](https://github.com/jbcom/yuka-kit/commit/cebd4b30e7751514e2d2eead3edc1b28b56dcf2a))
* add Yuka tactical combat intents ([9240033](https://github.com/jbcom/yuka-kit/commit/924003312277d0836136f5059cf7dcb607850fa7))
* automate releases and publish Sourcey docs ([a3c040c](https://github.com/jbcom/yuka-kit/commit/a3c040c166483a580b40cd9bfacad770d95db619))
* bind governors to Solo combat actions ([6f8afd2](https://github.com/jbcom/yuka-kit/commit/6f8afd2ddbf0ae311255df845d995b3581b8ee83))
* complete autonomous release and documentation foundation ([db23983](https://github.com/jbcom/yuka-kit/commit/db239837e42ae2baaed65c2d6b265512dd8375b2))
* extract ai-yuka to standalone OSS @jbcom/yuka-kit ([2388fec](https://github.com/jbcom/yuka-kit/commit/2388fec14a9cd6a7f646d676c1eac3d2dbd4a779))
* gate encounter rolls while combat is active ([c1818b2](https://github.com/jbcom/yuka-kit/commit/c1818b2ff5e7c13d7faf67f6644337380c2b78d1))
* govern authored recovery routes ([8eb6854](https://github.com/jbcom/yuka-kit/commit/8eb68542c01e548b311e53fc66f489df93f2ac5a))
* govern complete class combat kits ([7e02d12](https://github.com/jbcom/yuka-kit/commit/7e02d12ee78dc53fc2694cd0d443fa915693be0b))
* govern projectile clearance ([97e3bd7](https://github.com/jbcom/yuka-kit/commit/97e3bd70ca050b24ba86c49e0e714f36b86ae9b4))
* persist Yuka routine and FSM state ([6456e14](https://github.com/jbcom/yuka-kit/commit/6456e14555ed99c55828a2ffe4807655a617dd81))
* respect authoritative command availability ([806caef](https://github.com/jbcom/yuka-kit/commit/806caefbc273992363f69a6f4b24c667529a171c))
* share obstacle line of sight ([5e5955a](https://github.com/jbcom/yuka-kit/commit/5e5955ad7e4bfd2f417b943db140878c734d492f))
* **solo:** bridge Yuka vehicles through commands ([3c030dc](https://github.com/jbcom/yuka-kit/commit/3c030dc8c8d40179908a2fa6e761d0f4935d985a))
* **solo:** map normalized transfer coordinates ([66d5796](https://github.com/jbcom/yuka-kit/commit/66d579600ada2e1fee636e679f99f9595b408b9c))


### Bug Fixes

* advance managed combat brains in shared loop ([95eb24a](https://github.com/jbcom/yuka-kit/commit/95eb24a42952b2449faddf2ee74c62bc6494dfd7))
* bootstrap Corepack before workflow package commands ([bbc9296](https://github.com/jbcom/yuka-kit/commit/bbc92968e2bf79ce24b6be3a20ffcdcf55db10ca))
* defend mage against pack telegraphs ([005945b](https://github.com/jbcom/yuka-kit/commit/005945bb210d979b38937dcbed89cf1e8dd4268a))
* export governor action contracts ([31211bb](https://github.com/jbcom/yuka-kit/commit/31211bb3e0764b437e0bfa46d1d0abcd57e86c93))
* **governor:** release knight guard before movement ([ed057f3](https://github.com/jbcom/yuka-kit/commit/ed057f3cfcf1e984cd544e62d89e983a27a1a0d5))
* hold knight guard through telegraphs ([d7ffd10](https://github.com/jbcom/yuka-kit/commit/d7ffd10755bc42f608407c326e12bf6374795554))
* prevent Hunter kiting deadlocks ([9f7295b](https://github.com/jbcom/yuka-kit/commit/9f7295b7bbbaeb8418308acac10e5efc9c3469c8))
* recognize Dependabot non-major updates ([043dc51](https://github.com/jbcom/yuka-kit/commit/043dc5194dc68947347506e2c3555f2ec67add90))
* recognize Dependabot non-major updates ([ef08bef](https://github.com/jbcom/yuka-kit/commit/ef08befa18a8d50fedb376d85c729a3d5e3bb256))
* recognize trusted release-please pull requests ([b0998c5](https://github.com/jbcom/yuka-kit/commit/b0998c54bc7dac04ffef032927635758eebc526f))
* restore CI bootstrap and release PR filtering ([8e50006](https://github.com/jbcom/yuka-kit/commit/8e50006a5eccce66f9a1b427f2e42098209ef7e9))
* ship CommonJS declaration graph ([0eee6f4](https://github.com/jbcom/yuka-kit/commit/0eee6f47064b498e096884273c9fcec7db0dda5b))
* **solo:** convert governed movement speed units ([dbc72be](https://github.com/jbcom/yuka-kit/commit/dbc72bef8694e0947038fb877189560d0b10fcae))
* trigger checks for release pull requests ([9080855](https://github.com/jbcom/yuka-kit/commit/9080855125e0b4dc9b937c88cafde2f5564a3990))
* trigger checks for release pull requests ([aa79403](https://github.com/jbcom/yuka-kit/commit/aa7940319e38d5b8ff290c1d31da4630edd5ab10))

## 0.19.1

- Align the deterministic SHA-256 runtime to `@noble/hashes@2.3.0` while
  preserving the exact identity vectors across ESM, CommonJS, and clean
  consumer verification.
- Align the release toolchain to Node.js 24.19.0 LTS, pnpm 11.21.0, esbuild
  0.28.2, and Vite 8.2.1 without crossing the package's Node 24 boundary.
- Add a fail-closed live dependency-currency bootstrap for production
  dependencies, required peers, and installed optional peers.
- Harden the release workflow: verify the annotated source tag and exact
  `main` commit, publish with a trapped temporary credential, recheck the
  published bytes anonymously in root, Solo, and Koota consumers, and create
  the release only after that proof succeeds.

## 0.19.0

- Export closed validators for package-owned FSM, routine-agent, and encounter-
  director snapshots so games can validate untrusted save JSON without
  duplicating package schemas.
- Validate complete snapshots before mutating live Yuka state, including late
  encounter budget records, and reject unknown fields, malformed tuples,
  ambiguous duplicate records, impossible counters, and histories or partial
  legacy budgets that cannot fit their claimed encounter timeline.
- Bound every producer-owned persistence collection to the validator's 100,000-
  entry ceiling, with bounded history retention and explicit errors for
  lossless collections instead of unrestorable output.
- Preserve the exact pre-restore state and next deterministic decision whenever
  validation fails.
- Pin the complete Node 24 test toolchain to current Vite 8.2.0 rather than
  retaining an older compatible transitive resolution through Vitest.

## 0.18.0

- Add a closed, immutable semantic proposal protocol with canonical target
  order, integer-only priority fields, and a host-independent total comparator
  that returns the complete ranked set plus its selected proposal.
- Add synchronous SHA-256 derivation and validation for deterministic stream,
  proposal, and receipt ids through pinned `@noble/hashes@2.2.0`.
- Add a strict Solo dispatch envelope containing the complete semantic
  proposal, Rules tick, observation digest, and caller-defined deterministic
  Rules precondition SHA-256; trusted compilation now occurs only after
  current-state validation.
- Restrict strict compiler output to AI-source move, stop, or action commands,
  while preserving all legacy intent and transfer-map adapter behavior.
- Reject sparse, accessor-backed, named-property, custom-prototype, and mutable
  proposal/target/payload shapes before reading or dispatching them.
- Reject zero as a `SeededRandom` restore state instead of silently restoring a
  different PRNG state; the exact restorable range is `1..4294967295`.

## 0.17.0

- Add opt-in, state-aware NPC slot selection over exact authored days, phase
  sets, accepted cue sets, clock windows, and scalar public preconditions.
- Fail closed when no declared slot/fallback matches or equally specific slots
  overlap; source order and the legacy home destination are never implicit
  strict-mode tiebreakers.
- Add an opt-in cross-map transition mapper restricted to public action intents,
  while preserving the legacy raw `transfer-map` behavior by default.
- Preserve the required-number `RoutineScheduleEntry` contract and expose
  separate state-aware schedule types with optional/open-ended clock windows
  and no fabricated home destination.
- Verify packed ESM, CommonJS, and declarations in a clean external consumer,
  including legacy TypeScript arithmetic over required clock fields.
- Align CI to Node.js 24.18.1 and the repository to pnpm 11.18.0.

## 0.16.0

- Prevent corridor kiting deadlocks by making Hunters approach occluded route
  waypoints before evaluating close-range retreats, and fire a semantically
  ready basic shot between evasive rolls instead of retreating forever.
- Use the Hunter's evasive roll against ranged startup telegraphs, not only
  enemies already inside melee distance.

## 0.15.0

- Add strict, radius-aware AABB projectile clearance for ranged governors,
  including muzzle offsets and the target's collision radius. This keeps the
  existing endpoint-tolerant visual sight contract while preventing agents
  from repeatedly spawning shots inside nearby walls.
- Trust the game runtime's semantic action-readiness observation for Mage basic
  attacks instead of duplicating an obsolete hard-coded resource cost.

## 0.14.0

- Let Mage governors ward against any nearby startup telegraph in a pack,
  instead of ignoring an imminent attack whenever a different enemy happens
  to be the nearest target.
- Add reusable 2D AABB line-of-sight helpers extracted from a production-proven
  enemy governor, so ranged agents can reposition around authoritative
  Solo collision instead of firing through walls.

## 0.13.0

- Keep the Knight's authoritative guard raised for the full nearby enemy
  startup telegraph, including when a different nearby attacker is the
  immediate threat, and release it only after the danger window ends.

## 0.12.0

- Add path-aware recovery objectives to class-governor observations so
  low-health agents can reach authored healers, caches, or sanctuaries instead
  of repeatedly fleeing into a clamped map edge.
- Preserve class identity under recovery pressure by using an advertised
  Knight block, Hunter roll, or Mage ward against immediate telegraphs before
  continuing the recovery route.

## 0.11.0

- Extend reusable class governors to use the full opt-in combat kit exposed by
  a game: Knight rush and area attacks, Hunter roll and boss rite, and Mage
  ward, while preserving older integrations that do not advertise them.

## 0.10.0

- Add deterministic, snapshot-backed per-map budgets for encounter table
  entries so authored journeys can bound random combat without disabling it.

## 0.9.0

- Let encounter integrations suppress new Yuka-directed formation rolls while
  a previously spawned encounter is still active.

## 0.8.0

- Add Yuka-arbitrated `TacticalCombatAgent` intents for melee, ranged, charge, and ambush enemies.
- Add `BossTacticalAgent` to turn the shared phase-aware `BossBrain` into actionable movement, attack, barrage, and summon intents.
- Base tactical distances and authored behavior on production-proven enemy loops while keeping combat effects game-owned.

## 0.7.0

- Add versioned snapshots for accepted NPC routine activities and registered
  Yuka FSM state so save/load resumes AI behavior instead of only positions.

## 0.6.0

- Add an explicit Yuka-to-Solo movement-speed converter so normalized class
  governor speeds do not leak into pixel-space runtimes.

## 0.5.0

- Export governor action names and binding types from the supported package
  root so clean consumers do not reach into private declaration paths.

## 0.4.0

- Add governor observations for exact semantic action readiness and combat-safe
  movement availability.
- Make every class wait through Solo startup, recovery, cooldown, root, and
  stun windows instead of issuing commands that the authoritative runtime must
  reject.
- Add an explicit normalized-to-runtime position mapper for Solo map transfers,
  so Tiled pixel coordinates are never assumed to equal Yuka steering units.
- Make `stepAI()` advance managed combat FSMs with the real frame delta before
  Yuka steering and GOAP, eliminating game-local manual FSM ticking.
- Add a Solo AI vehicle bridge that derives Yuka state from authoritative Solo
  entities and returns steering through the public AI command boundary.
- Give Knight governors an explicit guard-release action driven by observed
  authoritative guard state, preventing a successful block from deadlocking
  later movement.

## 0.3.0

- Add backward-compatible structured class-action bindings so Yuka governors
  can dispatch `combat:use` with an exact Solo action ID and target payload.
- Preserve the existing string action API while removing the need for
  game-local combat alias handlers.

## 0.2.0

- Add deterministic random encounter pressure, cooldown, repeat suppression,
  snapshots, and weighted Yuka evaluator arbitration.
- Add safe ring, ambush, line, wedge, and scatter formation generation.
- Add Yuka-governed NPC schedule loops with accepted-action acknowledgement.
- Add distinct knight, hunter, and mage class playthrough governors.
- Add the `@arcade-cabinet/ai-yuka/solo` command adapter and stall-aware
  governed playthrough harness for RPGJS Solo.
- Keep all game integration command-driven: no direct runtime mutation,
  teleporting class governors, or renderer dependency.

## 0.1.0

- Restore and verify the original extracted package baseline.
