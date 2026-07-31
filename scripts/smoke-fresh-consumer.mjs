import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
  RoutineAgent,
  resolveStateAwareRoutineTarget,
  type RoutineSchedule,
  type StateAwareRoutineSchedule,
} from '@arcade-cabinet/ai-yuka';

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
void legacyMinuteArithmetic;
`);
  run(join(consumerDirectory, 'node_modules/.bin/tsc'), ['--project', 'tsconfig.json']);

  await writeFile(join(consumerDirectory, 'esm.mjs'), `
import { resolveStateAwareRoutineTarget } from '@arcade-cabinet/ai-yuka';
const target = resolveStateAwareRoutineTarget({
  entries: [{ id: 'work', mapId: 'town', position: { x: 1, y: 0, z: 1 }, when: { phaseId: 'work' } }],
}, { day: 1, minuteOfDay: 1, mapId: 'home', position: { x: 0, y: 0, z: 0 }, phaseId: 'work' });
if (target.id !== 'work') throw new Error('ESM state-aware export failed');
`);
  await writeFile(join(consumerDirectory, 'cjs.cjs'), `
const { resolveStateAwareRoutineTarget } = require('@arcade-cabinet/ai-yuka');
const target = resolveStateAwareRoutineTarget({
  entries: [{ id: 'work', mapId: 'town', position: { x: 1, y: 0, z: 1 }, when: { phaseId: 'work' } }],
}, { day: 1, minuteOfDay: 1, mapId: 'home', position: { x: 0, y: 0, z: 0 }, phaseId: 'work' });
if (target.id !== 'work') throw new Error('CJS state-aware export failed');
`);
  run(process.execPath, ['esm.mjs']);
  run(process.execPath, ['cjs.cjs']);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
