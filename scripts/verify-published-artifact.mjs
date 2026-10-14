import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
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

/** Read only the exact public version; npm configuration and credentials are never consulted. */
export const readPublishedVersion = async (manifest, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) => {
  assert.match(manifest.name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/, 'invalid package name');
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'exact package version required');
  const url = `https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`;
  const response = await fetchImpl(url, {
    credentials: 'omit', redirect: 'error', cache: 'no-store',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return null;
  }
  if (response.status !== 200) throw new Error(`Public npm registry returned HTTP ${response.status}`);
  const published = await response.json();
  assert.ok(published && typeof published === 'object' && !Array.isArray(published), 'invalid published metadata');
  return published;
};

/** Only a missing public version can be pending while npm processes a successful publish. */
export const verifyPublicVersion = async (manifest, packed, {
  waitMs = 0, intervalMs = 10_000, now = Date.now, pause = sleep,
  fetchImpl = fetch, log = console.log,
} = {}) => {
  const started = now();
  const deadline = started + waitMs;
  for (;;) {
    const remaining = deadline - now();
    if (waitMs > 0 && remaining <= 0) throw new Error('Public npm publication processing deadline exceeded');
    let published;
    try {
      published = await readPublishedVersion(manifest, {
        fetchImpl, timeoutMs: waitMs > 0 ? Math.min(10_000, remaining) : 10_000,
      });
    } catch (error) {
      if (waitMs > 0 && now() >= deadline) throw new Error('Public npm publication processing deadline exceeded', { cause: error });
      throw error;
    }
    // Include both transport and JSON parsing in the processing deadline.
    if (waitMs > 0 && now() >= deadline) throw new Error('Public npm publication processing deadline exceeded');
    if (published !== null) {
      assertPublishedArtifact(manifest, published, packed);
      return true;
    }
    if (waitMs === 0) return false;
    log(`Public npm version pending: HTTP 404; processing age ${now() - started}ms.`);
    const pauseMs = Math.min(intervalMs, deadline - now());
    if (pauseMs <= 0) throw new Error('Public npm publication processing deadline exceeded');
    await pause(pauseMs);
  }
};

const verify = async () => {
  const args = process.argv.slice(2);
  assert.ok(args.length <= 1 && args.every((arg) => ['--check', '--wait'].includes(arg)), 'unknown registry verification mode');
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const scratch = await mkdtemp(join(tmpdir(), 'yuka-kit-registry-'));
  try {
    const { stdout: pack } = await exec('npm', [
      'pack', '--json', '--ignore-scripts', '--pack-destination', scratch, '--userconfig=/dev/null',
    ]);
    const exists = await verifyPublicVersion(manifest, JSON.parse(pack)[0], {
      waitMs: args.includes('--wait') ? 300_000 : 0,
    });
    if (args.includes('--check')) {
      assert.ok(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required for the registry preflight');
      await appendFile(process.env.GITHUB_OUTPUT, `publish=${!exists}\n`);
      if (exists) console.log(`${manifest.name}@${manifest.version} is already on npm; skipping publication.`);
    } else {
      assert.ok(exists, 'Published package was not visible in the public npm registry');
    }
    if (exists) console.log('Published identity and artifact match the verified release build.');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verify();
}
