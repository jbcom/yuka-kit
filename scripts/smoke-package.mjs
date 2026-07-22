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
}

for (const entry of [soloEsm, soloCjs]) {
  assert.equal(typeof entry.SoloCommandAdapter, 'function');
  assert.equal(typeof entry.runGovernedPlaythrough, 'function');
}
