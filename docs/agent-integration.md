---
title: Agent integration contract
description: Use deterministic proposals and strict Solo envelopes without giving an AI direct authority over game state.
---

# Agent integration contract

Use an AI model or autonomous system as a proposer, never as a direct executor.
Yuka Kit provides deterministic identity and semantic proposal validation so a
host can make that boundary inspectable and replayable.

## Safe flow

1. Build a game-owned observation from authoritative state.
2. Ask a `TacticalCombatAgent`, `RoutineAgent`, `ClassGovernor`, or external
   agent for an intent or proposal.
3. Validate the shape and identity at the package boundary.
4. Apply your own authorization, availability, cooldown, ownership, and map
   checks.
5. Dispatch a game command only after acceptance; acknowledge routine activity
   only when that dispatch succeeds.

```ts
import {
  createAICommandDispatchEnvelope,
  validateAICommandDispatchEnvelope,
} from '@jbdevprimary/yuka-kit/solo';

const envelope = createAICommandDispatchEnvelope({
  proposal: {
    schema: 'arcade-ai-yuka-semantic-proposal/v1',
    streamId: 'combat-turns', decisionOrdinal: 42,
    observationDigest: 'a'.repeat(64),
    proposalId: 'companion-7:42', goalId: 'open-gate', goalOrdinal: 3,
    utilityMicros: 900_000, bindingId: 'interact-gate', bindingOrdinal: 1,
    proposalOrdinal: 0, targets: [], reasonCode: 'route-open',
  },
  rulesTick: 42,
  expectedRulesRevisionSha256: 'b'.repeat(64),
});

const checked = validateAICommandDispatchEnvelope(envelope);
// Then enforce the game-owned permissions and execute the accepted command.
```

## Deterministic selection

When several systems propose the same kind of command, normalize them with
`validateSemanticCommandProposal()` and select with
`selectSemanticCommandProposal()`. The identity helpers use a documented,
stable tuple and SHA-256; do not replace them with object-stringification or
locale-sensitive sorting.

## What validation guarantees—and does not

Closed validators reject prototypes, accessors, unknown fields, sparse arrays,
cycles, symbol keys, and non-finite numbers before returning normalized data.
They do **not** decide whether a command is allowed in your game. Keep that
authorization policy on the server or other authoritative runtime.
