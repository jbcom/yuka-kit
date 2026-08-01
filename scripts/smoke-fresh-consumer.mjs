import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'arcade-ai-yuka-consumer-'));
const packDirectory = join(scratch, 'pack');
const consumerDirectory = join(scratch, 'consumer');

const run = (command, args, cwd = consumerDirectory) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await Promise.all([
    mkdir(packDirectory, { recursive: true }),
    mkdir(consumerDirectory, { recursive: true }),
  ]);
  const packResult = JSON.parse(run('npm', [
    'pack', '--json', '--pack-destination', packDirectory,
  ], root));
  assert.equal(packResult.length, 1);
  const packedFiles = new Set(packResult[0].files.map(({ path }) => path));
  for (const required of [
    'README.md',
    'CHANGELOG.md',
    'dist/esm/index.js',
    'dist/esm/index.d.ts',
    'dist/esm/proposals/identity.d.ts',
    'dist/esm/solo/index.d.ts',
    'dist/cjs/index.js',
  ]) {
    assert.equal(packedFiles.has(required), true, `packed artifact is missing ${required}`);
  }

  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
    name: 'arcade-ai-yuka-fresh-consumer',
    private: true,
    type: 'module',
  }, null, 2));
  const tarball = join(packDirectory, packResult[0].filename);
  run('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry=https://registry.npmjs.org/',
    tarball, 'yuka@0.7.8', 'typescript@7.0.2',
  ]);

  await writeFile(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
    },
    include: ['consumer.ts'],
  }, null, 2));
  await writeFile(join(consumerDirectory, 'consumer.ts'), `
import {
  createCombatVehicle,
  deriveDeterministicIdentity,
  EncounterDirector,
  restoreFsmState,
  RoutineAgent,
  resolveStateAwareRoutineTarget,
  selectSemanticCommandProposal,
  SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
  snapshotFsmState,
  TacticalCombatAgent,
  validateEncounterDirectorSnapshot,
  validateFsmStateSnapshot,
  validateRoutineAgentSnapshot,
  type RoutineSchedule,
  type StateAwareRoutineSchedule,
} from '@arcade-cabinet/ai-yuka';
import {
  createAICommandDispatchEnvelope,
  SoloCommandAdapter,
} from '@arcade-cabinet/ai-yuka/solo';

const legacy: RoutineSchedule = {
  home: { mapId: 'home', position: { x: 0, y: 0, z: 0 } },
  entries: [{
    id: 'legacy', startMinute: 10, endMinute: 20,
    mapId: 'town', position: { x: 1, y: 0, z: 1 },
  }],
};
const legacyMinuteArithmetic: number = legacy.entries[0].startMinute + legacy.entries[0].endMinute;
new RoutineAgent({ schedule: legacy });

const authored: StateAwareRoutineSchedule = {
  entries: [{
    id: 'authored', mapId: 'keep', anchorId: 'keep-work', position: { x: 2, y: 0, z: 2 },
    when: {
      phaseIds: ['work', 'aftermath'], days: [2, 5],
      requiredCueIds: ['admitted'],
      publicPreconditions: [{ key: 'doorOpen', operator: 'equals', value: true }],
    },
  }],
};
const observation = {
  day: 2, minuteOfDay: 900, mapId: 'town', position: { x: 0, y: 0, z: 0 },
  phaseId: 'work', activeCueIds: ['admitted'], publicState: { doorOpen: true },
  observationTick: 44,
} as const;
resolveStateAwareRoutineTarget(authored, observation);
new RoutineAgent({
  schedule: authored,
  slotSelection: 'state-aware',
  mapCrossMapTransition: ({ target, observation: current }) => ({
    kind: 'action',
    action: 'request-scheduled-transition',
    payload: {
      slotId: target.id, mapId: target.mapId, anchorId: target.anchorId,
      tick: current.observationTick,
    },
  }),
});

const routine = new RoutineAgent({ schedule: legacy });
const routineObservation = {
  day: 1, minuteOfDay: 15, mapId: 'town', position: { x: 1, y: 0, z: 1 },
};
const routineDecision = routine.decide(routineObservation);
routine.acknowledge(routineDecision, true);
const routineSnapshot = validateRoutineAgentSnapshot(routine.snapshot());
const restoredRoutine = new RoutineAgent({ schedule: legacy });
restoredRoutine.restore(routineSnapshot);

const encounters = new EncounterDirector({ seed: 'consumer', baseChance: 1, minStepsBetweenEncounters: 0 });
encounters.consider({
  step: 1, mapId: 'town', level: 1, playerPosition: { x: 0, y: 0, z: 0 },
}, [{ id: 'consumer-encounter', weight: 1 }]);
const encounterSnapshot = validateEncounterDirectorSnapshot(encounters.snapshot());
const restoredEncounters = new EncounterDirector({ seed: 'restore', baseChance: 1, minStepsBetweenEncounters: 0 });
restoredEncounters.restore(encounterSnapshot);

const fighter = createCombatVehicle({ speed: 2 });
const fsmSnapshot = validateFsmStateSnapshot(snapshotFsmState(fighter.stateMachine));
restoreFsmState(fighter.stateMachine, fsmSnapshot);

const tactical = new TacticalCombatAgent({ tactic: 'melee', detectionRange: 8, attackRange: 2 });
const tacticalDecision = tactical.decide({
  position: { x: 0, y: 0, z: 0 }, target: { x: 1, y: 0, z: 0 }, healthPct: 1,
});
if (tacticalDecision.behavior !== 'attack') throw new Error('typed tactical export failed');

const observationDigest = 'ab'.repeat(32);
const rulesRevisionSha256 = 'cd'.repeat(32);
const streamId = deriveDeterministicIdentity('stream', ['consumer', 'npc', 1]);
const proposalId = deriveDeterministicIdentity('proposal', [streamId, 1, 'binding:wait']);
const selection = selectSemanticCommandProposal([{
  schema: SEMANTIC_COMMAND_PROPOSAL_SCHEMA,
  streamId,
  decisionOrdinal: 1,
  observationDigest,
  proposalId,
  goalId: 'goal:wait',
  goalOrdinal: 0,
  utilityMicros: 1,
  bindingId: 'binding:wait',
  bindingOrdinal: 0,
  proposalOrdinal: 0,
  targets: [],
  reasonCode: 'WAIT',
}]);
if (selection.selected) {
  const envelope = createAICommandDispatchEnvelope({
    proposal: selection.selected,
    rulesTick: 5,
    expectedRulesRevisionSha256: rulesRevisionSha256,
  });
  const adapter = new SoloCommandAdapter({ dispatch: () => ({ accepted: true, tick: 5 }) });
  adapter.dispatchEnvelope(envelope, {
    rulesTick: 5,
    observationDigest,
    rulesRevisionSha256,
  }, () => ({ type: 'stop', entityId: 'npc', source: 'ai' }));
}
void legacyMinuteArithmetic;
`);
  run(join(consumerDirectory, 'node_modules/.bin/tsc'), ['--project', 'tsconfig.json']);
  assert.equal(
    existsSync(join(consumerDirectory, 'node_modules/koota')),
    false,
    'optional koota peer must remain absent for root-only consumers',
  );

  await writeFile(join(consumerDirectory, 'esm.mjs'), `
import {
  deriveDeterministicIdentity,
  EncounterDirector,
  resolveStateAwareRoutineTarget,
  TacticalCombatAgent,
  validateEncounterDirectorSnapshot,
} from '@arcade-cabinet/ai-yuka';
const target = resolveStateAwareRoutineTarget({
  entries: [{ id: 'work', mapId: 'town', position: { x: 1, y: 0, z: 1 }, when: { phaseId: 'work' } }],
}, { day: 1, minuteOfDay: 1, mapId: 'home', position: { x: 0, y: 0, z: 0 }, phaseId: 'work' });
if (target.id !== 'work') throw new Error('ESM state-aware export failed');
if (!deriveDeterministicIdentity('receipt', ['esm', 1]).startsWith('receipt:')) throw new Error('ESM identity export failed');
const director = new EncounterDirector({ seed: 1 });
validateEncounterDirectorSnapshot(director.snapshot());
if (new TacticalCombatAgent({ tactic: 'melee', detectionRange: 5, attackRange: 1 }).decide({
  position: { x: 0, y: 0, z: 0 }, target: { x: 0.5, y: 0, z: 0 }, healthPct: 1,
}).behavior !== 'attack') throw new Error('ESM tactical export failed');
`);
  await writeFile(join(consumerDirectory, 'cjs.cjs'), `
const {
  deriveDeterministicIdentity,
  EncounterDirector,
  resolveStateAwareRoutineTarget,
  TacticalCombatAgent,
  validateEncounterDirectorSnapshot,
} = require('@arcade-cabinet/ai-yuka');
const target = resolveStateAwareRoutineTarget({
  entries: [{ id: 'work', mapId: 'town', position: { x: 1, y: 0, z: 1 }, when: { phaseId: 'work' } }],
}, { day: 1, minuteOfDay: 1, mapId: 'home', position: { x: 0, y: 0, z: 0 }, phaseId: 'work' });
if (target.id !== 'work') throw new Error('CJS state-aware export failed');
if (!deriveDeterministicIdentity('receipt', ['cjs', 1]).startsWith('receipt:')) throw new Error('CJS identity export failed');
const director = new EncounterDirector({ seed: 1 });
validateEncounterDirectorSnapshot(director.snapshot());
if (new TacticalCombatAgent({ tactic: 'melee', detectionRange: 5, attackRange: 1 }).decide({
  position: { x: 0, y: 0, z: 0 }, target: { x: 0.5, y: 0, z: 0 }, healthPct: 1,
}).behavior !== 'attack') throw new Error('CJS tactical export failed');
`);
  run(process.execPath, ['esm.mjs']);
  run(process.execPath, ['cjs.cjs']);

  run('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    '--registry=https://registry.npmjs.org/', 'koota@0.6.6',
  ]);
  await writeFile(join(consumerDirectory, 'koota-consumer.ts'), `
import { AIBridge, AIState, type AIBridgeTraits } from '@arcade-cabinet/ai-yuka/koota';
const bridgeConstructor: typeof AIBridge = AIBridge;
const stateTrait = AIState;
const traits = null as AIBridgeTraits | null;
void bridgeConstructor;
void stateTrait;
void traits;
`);
  await writeFile(join(consumerDirectory, 'koota-tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
    },
    include: ['koota-consumer.ts'],
  }, null, 2));
  await writeFile(join(consumerDirectory, 'koota-esm.mjs'), `
import { AIBridge, AIState } from '@arcade-cabinet/ai-yuka/koota';
if (typeof AIBridge !== 'function' || !AIState) throw new Error('ESM koota bridge export failed');
`);
  await writeFile(join(consumerDirectory, 'koota-cjs.cjs'), `
const { AIBridge, AIState } = require('@arcade-cabinet/ai-yuka/koota');
if (typeof AIBridge !== 'function' || !AIState) throw new Error('CJS koota bridge export failed');
`);
  run(join(consumerDirectory, 'node_modules/.bin/tsc'), ['--project', 'koota-tsconfig.json']);
  run(process.execPath, ['koota-esm.mjs']);
  run(process.execPath, ['koota-cjs.cjs']);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
