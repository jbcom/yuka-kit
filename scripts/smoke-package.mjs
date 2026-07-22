import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const esm = await import('../dist/esm/index.js');
const require = createRequire(import.meta.url);
const cjs = require('../dist/cjs/index.js');

for (const entry of [esm, cjs]) {
  assert.equal(typeof entry.createEntityManager, 'function');
  assert.equal(typeof entry.createBrain, 'function');
  assert.equal(typeof entry.astar, 'function');
}
