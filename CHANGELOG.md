# Changelog

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
- Add reusable 2D AABB line-of-sight helpers extracted from the fleet-proven
  Quest enemy governor, so ranged agents can reposition around authoritative
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
- Base tactical distances and authored behavior on the fleet-proven enemy loops from A Good Old-Fashioned Adventure while keeping combat effects game-owned.

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

- Restore and verify the original fleet-tournament package baseline.
