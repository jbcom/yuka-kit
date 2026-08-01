import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const esm = await import('../dist/esm/index.js');
const require = createRequire(import.meta.url);
const cjs = require('../dist/cjs/index.js');
const soloEsm = await import('../dist/esm/solo/index.js');
const soloCjs = require('../dist/cjs/solo/index.js');

for (const entry of [esm, cjs]) {
  assert.equal(typeof entry.createEntityManager, 'function');
  assert.equal(typeof entry.createBrain, 'function');
  assert.equal(typeof entry.astar, 'function');
  assert.equal(typeof entry.resolveStateAwareRoutineTarget, 'function');
  assert.equal(typeof entry.validateFsmStateSnapshot, 'function');
  assert.equal(typeof entry.validateRoutineAgentSnapshot, 'function');
  assert.equal(typeof entry.validateEncounterDirectorSnapshot, 'function');
  assert.equal(typeof entry.RoutineSlotConflictError, 'function');
  assert.equal(typeof entry.RoutineSlotNotFoundError, 'function');
  assert.equal(typeof entry.deriveDeterministicIdentity, 'function');
  assert.equal(typeof entry.selectSemanticCommandProposal, 'function');
}

for (const entry of [soloEsm, soloCjs]) {
  assert.equal(typeof entry.SoloCommandAdapter, 'function');
  assert.equal(typeof entry.runGovernedPlaythrough, 'function');
  assert.equal(typeof entry.createAICommandDispatchEnvelope, 'function');
  assert.equal(typeof entry.validateStrictSoloAICommand, 'function');
}
