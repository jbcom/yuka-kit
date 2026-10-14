import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export const assertPublishedArtifact = (manifest, published, packed) => {
  assert.equal(published.name, manifest.name, 'published package name differs');
  assert.equal(published.version, manifest.version, 'published package version differs');
  assert.equal(published.repository?.url, manifest.repository.url, 'published repository differs');
  assert.match(packed.integrity ?? '', /^sha512-[A-Za-z0-9+/]+={0,2}$/, 'local pack integrity is missing');
  assert.equal(published.dist?.integrity, packed.integrity, 'published artifact differs from verified release build');
};

const verify = async () => {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const scratch = await mkdtemp(join(tmpdir(), 'yuka-kit-registry-'));
  try {
    const { stdout: metadata } = await exec('npm', [
      'view', `${manifest.name}@${manifest.version}`, '--json',
      '--registry=https://registry.npmjs.org', '--userconfig=/dev/null',
    ]);
    const { stdout: pack } = await exec('npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', scratch, '--userconfig=/dev/null',
    ]);
    assertPublishedArtifact(manifest, JSON.parse(metadata), JSON.parse(pack)[0]);
    console.log('Published identity and artifact match the verified release build.');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verify();
}
