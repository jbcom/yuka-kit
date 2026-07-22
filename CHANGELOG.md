# Changelog

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
