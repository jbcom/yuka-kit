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

for (const entry of [esm, cjs]) {
  assert.equal(typeof entry.createHearingSensor, 'function');
  assert.equal(typeof entry.PerceptionMemory, 'function');
  assert.equal(typeof entry.createLitVisionSensor, 'function');
}

const goapEsm = await import('../dist/esm/goap/index.js');
const goapCjs = require('../dist/cjs/goap/index.js');
const goapPlans = [goapEsm, goapCjs].map((entry) => {
  assert.equal(typeof entry.GoapActionRegistry, 'function');
  assert.equal(typeof entry.GoapPlanGoal, 'function');
  assert.equal(typeof entry.GoapGoalEvaluator, 'function');
  const result = entry.planGoap({ near: false }, { claimed: true }, [
    { id: 'claim', cost: 1, preconditions: { near: true }, effects: { claimed: true } },
    { id: 'approach', cost: 2, preconditions: {}, effects: { near: true } },
  ]);
  assert.equal(result.found, true);
  return result.actions.map(({ id }) => id);
});
assert.deepEqual(goapPlans[0], ['approach', 'claim']);
assert.deepEqual(goapPlans[1], goapPlans[0]);

for (const entry of [soloEsm, soloCjs]) {
  assert.equal(typeof entry.SoloCommandAdapter, 'function');
  assert.equal(typeof entry.runGovernedPlaythrough, 'function');
  assert.equal(typeof entry.createAICommandDispatchEnvelope, 'function');
  assert.equal(typeof entry.validateStrictSoloAICommand, 'function');
}
