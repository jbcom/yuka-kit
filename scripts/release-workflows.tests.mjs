import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { validateReleaseWorkflows } from './release-workflow-contract.mjs';
import { assertPublishedArtifact, readPublishedVersion, verifyPublicVersion } from './verify-published-artifact.mjs';

const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const release = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const publish = await readFile(new URL('../.github/workflows/cd.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const nvmrc = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim();
const workflows = { ci, release, publish };

describe('release workflow contract', () => {
  it('rejects existing versions with foreign identity or different published bytes', () => {
    const integrity = 'sha512-YWJjZA==';
    const published = {
      name: manifest.name, version: manifest.version,
      repository: manifest.repository, dist: { integrity },
    };
    assert.doesNotThrow(() => assertPublishedArtifact(manifest, published, { integrity }));
    assert.throws(() => assertPublishedArtifact(manifest, { ...published, name: 'other' }, { integrity }), /name differs/);
    assert.throws(() => assertPublishedArtifact(manifest, { ...published, version: '0.0.0' }, { integrity }), /version differs/);
    assert.throws(() => assertPublishedArtifact(manifest, { ...published, repository: { url: 'https://example.com/other' } }, { integrity }), /repository differs/);
    assert.throws(() => assertPublishedArtifact(manifest, { ...published, dist: { integrity: 'sha512-ZGlmZmVyZW50' } }, { integrity }), /artifact differs/);
    assert.throws(() => assertPublishedArtifact(manifest, { ...published, dist: {} }, { integrity }), /artifact differs/);
    assert.throws(() => assertPublishedArtifact(manifest, published, {}), /local pack integrity is missing/);
    assert.throws(() => validateReleaseWorkflows({ ci, release, publish: publish.replaceAll('node scripts/verify-published-artifact.mjs', '') }), /registry preflight/);
  });

  it('supports all non-EOL Node lines with a major-only execution toolchain', () => {
    assert.equal(manifest.engines.node, '>=22');
    assert.equal(nvmrc, '26');
    assert.ok(Number(nvmrc) >= 22);
  });
  it('publishes publicly with provenance under the package name', () => {
    assert.equal(manifest.name, 'yuka-kit');
    assert.equal(manifest.publishConfig.access, 'public');
    assert.equal(manifest.publishConfig.provenance, true);
    assert.equal(manifest.license, 'MIT');
  });
  it('accepts the complete hardened workflow', () => {
    assert.doesNotThrow(() => validateReleaseWorkflows(workflows));
  });

  it('accepts an updated immutable release metadata upload pin', () => {
    const updated = release.replace(/actions\/upload-artifact@[a-f0-9]{40}/g,
      `actions/upload-artifact@${'a'.repeat(40)}`);
    assert.notEqual(updated, release, 'mutation must change the current action pin');
    assert.doesNotThrow(() => validateReleaseWorkflows({ ...workflows, release: updated }));
  });

  it('distinguishes a missing upload action from an unpinned action', () => {
    const updated = release.replace(/actions\/upload-artifact@[a-f0-9]{40}/g,
      `actions/download-artifact@${'a'.repeat(40)}`);
    assert.throws(() => validateReleaseWorkflows({ ...workflows, release: updated }),
      /workflow contract is missing SHA-pinned release metadata upload/);
  });

  for (const ref of ['main', 'v7', 'a'.repeat(39), 'a'.repeat(41)]) {
    it(`rejects non-immutable release metadata upload reference ${ref}`, () => {
      const updated = release.replace(/actions\/upload-artifact@[a-f0-9]{40}/g,
        `actions/upload-artifact@${ref}`);
      assert.throws(() => validateReleaseWorkflows({ ...workflows, release: updated }),
        /requires immutable SHA pin for SHA-pinned release metadata upload/);
    });
  }

  it('rejects an unpinned upload even when another upload is pinned', () => {
    assert.throws(() => validateReleaseWorkflows({ ...workflows,
      release: `${release}\n      - uses: actions/upload-artifact@main\n` }),
      /requires immutable SHA pin for SHA-pinned release metadata upload/);
  });

  for (const step of [
    '      - uses:  actions/upload-artifact@main\n',
    '      - uses: "actions/upload-artifact@main"\n',
    '      - { "uses": actions/upload-artifact@main }\n',
    '      - uses: >-\n          actions/upload-artifact@main\n',
    '      - &upload { uses: actions/upload-artifact@main }\n      - <<: *upload\n',
  ]) {
    it(`rejects an unpinned upload expressed as YAML: ${step.trim()}`, () => {
      assert.throws(() => validateReleaseWorkflows({ ...workflows,
        release: `${release}\n${step}` }), /requires immutable SHA pin/);
    });
  }

  it('does not treat a commented pin as an immutable upload', () => {
    const updated = release.replace(/actions\/upload-artifact@[a-f0-9]{40}/g,
      'actions/upload-artifact@main');
    assert.throws(() => validateReleaseWorkflows({ ...workflows,
      release: `${updated}\n# uses: actions/upload-artifact@${'a'.repeat(40)}\n` }),
      /requires immutable SHA pin/);
  });

  it('executes the aggregate gate against successful, skipped and failed jobs', () => {
    const gate = ci.slice(ci.indexOf('\n  gate:'));
    const code = gate.match(/node --input-type=module -e '([\s\S]*?)'/)[1];
    for (const result of ['success', 'skipped', 'failure', 'cancelled', 'unknown']) {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        env: { ...process.env, NEEDS_JSON: JSON.stringify({ verify: { result: 'success' }, other: { result } }) },
      });
      assert.equal(child.status, ['success', 'skipped'].includes(result) ? 0 : 1);
    }
  });

  const mutations = [
    ['publish', "github.event.workflow_run.event == 'push'", "github.event.workflow_run.event == 'pull_request'"],
    ['publish', 'github.event.workflow_run.head_repository.full_name == github.repository', 'true'],
    ['publish', 'group: npm-publish-${{ github.event.workflow_run.id }}', 'group: pages'],
    ['release', 'RELEASE_TAG: ${{ steps.release.outputs.tag_name }}', 'RELEASE_TAG: latest'],
    ['release', 'RELEASE_SHA: ${{ steps.release.outputs.sha }}', 'RELEASE_SHA: ${{ github.sha }}'],
    ['publish', 'RUN_ID: ${{ github.event.workflow_run.id }}', 'RUN_ID: latest'],
    ['publish', 'test "$(git rev-parse HEAD)" = "$EXPECTED_RELEASE_SHA"', 'true'],
    ['publish', 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', 'actions/checkout@main'],
    ['publish', 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', 'actions/setup-node@main'],
    ['ci', 'persist-credentials: false', 'persist-credentials: true'],
    ['publish', 'node-version-file: .nvmrc', 'node-version: 20'],
    ['ci', 'node: ["22", "24", "26"]', 'node: ["26"]'],
    ['ci', 'needs: [verify, pre-commit, legacy-verify]', 'needs: [verify]'],
    ['ci', 'NEEDS_JSON: ${{ toJSON(needs) }}', 'NEEDS_JSON: {}'],
    ['ci', '["success", "skipped"].includes(result)', 'true'],
    ['ci', 'process.exit(1)', 'process.exit(0)'],
    ['ci', 'if: always()', 'if: success()'],
    ['ci', 'test "$VERIFY_RESULT" = success', 'true'],
    ['ci', 'test "$PRE_COMMIT_RESULT" = success', 'true'],
    ['ci', 'run: pnpm verify', 'run: pnpm build'],
    ['release', 'googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7', 'googleapis/release-please-action@main'],
    ['publish', "if: github.event.workflow_run.name == 'Release' && github.event.workflow_run.conclusion == 'success'", 'if: always()'],
    ['publish', 'ref: ${{ steps.release.outputs.tag }}', 'ref: main'],
    ['publish', "      - if: steps.release.outputs.tag != ''\n        run: pnpm verify", "      - if: steps.release.outputs.tag != ''\n        run: pnpm build"],
    ['publish', 'id-token: write', 'id-token: none'],
    ['publish', '--provenance', ''],
    ['publish', '--access public', '--access restricted'],
    ['publish', 'verify-published-artifact.mjs --check', 'verify-published-artifact.mjs'],
    ['publish', 'verify-published-artifact.mjs --wait', 'verify-published-artifact.mjs'],
    ['publish', 'Verify public registry publication', 'No registry check'],
    ['publish', "      - name: Publish\n        if: steps.registry.outputs.publish == 'true'", '      - name: Publish'],
    ['publish', 'registry-url: https://registry.npmjs.org', 'registry-url: https://redacted-private-registry.example'],
  ];
  for (const [workflow, before, after] of mutations) {
    it(`rejects removal of ${workflow}: ${before}`, () => {
      assert.ok(workflows[workflow].includes(before), 'mutation must change real workflow bytes');
      assert.throws(() => validateReleaseWorkflows({
        ...workflows, [workflow]: workflows[workflow].replaceAll(before, after),
      }));
    });
  }
  for (const workflow of ['ci', 'release', 'publish']) {
    it(`rejects token authentication in ${workflow}`, () => {
      assert.throws(() => validateReleaseWorkflows({
        ...workflows, [workflow]: workflows[workflow] + '\nNODE_AUTH_TOKEN: secret\n',
      }), /npm auth token/);
    });
  }
  for (const workflow of ['ci', 'release']) {
    it(`rejects a second publishing path in ${workflow}`, () => {
      assert.throws(() => validateReleaseWorkflows({
        ...workflows, [workflow]: workflows[workflow] + '\n      - run: npm publish\n',
      }), /publication/);
    });
  }
  it('rejects verification moved after publishing', () => {
    const step = "      - if: steps.release.outputs.tag != ''\n        run: pnpm verify\n";
    const changed = publish.replace(step, '') + step;
    assert.throws(() => validateReleaseWorkflows({ ...workflows, publish: changed }), /out of order/);
  });
});


describe('anonymous exact-version public registry verification', () => {
  const packed = { integrity: 'sha512-YWJjZA==' };
  const metadata = { name: manifest.name, version: manifest.version,
    repository: manifest.repository, dist: packed };
  const response = (status, data = metadata) => new Response(JSON.stringify(data), { status });

  it('uses a fixed exact endpoint without credentials, redirects or a cache', async () => {
    const oldToken = process.env.NODE_AUTH_TOKEN;
    process.env.NODE_AUTH_TOKEN = 'must-not-be-sent';
    try {
      assert.deepEqual(await readPublishedVersion(manifest, { fetchImpl: async (url, options) => {
        assert.equal(url, `https://registry.npmjs.org/yuka-kit/${manifest.version}`);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        assert.deepEqual(options.headers, { Accept: 'application/json', 'Cache-Control': 'no-cache' });
        assert.ok(options.signal instanceof AbortSignal);
        return response(200);
      } }), metadata);
    } finally {
      if (oldToken === undefined) delete process.env.NODE_AUTH_TOKEN;
      else process.env.NODE_AUTH_TOKEN = oldToken;
    }
  });

  it('accepts ready metadata and permits a new publication only for HTTP 404', async () => {
    assert.equal(await verifyPublicVersion(manifest, packed, { fetchImpl: async () => response(200) }), true);
    assert.equal(await verifyPublicVersion(manifest, packed, { fetchImpl: async () => response(404) }), false);
  });

  it('waits for processing then verifies identity and bytes', async () => {
    let elapsed = 0;
    let calls = 0;
    const logs = [];
    assert.equal(await verifyPublicVersion(manifest, packed, {
      waitMs: 30, intervalMs: 10, now: () => elapsed,
      pause: async (ms) => { elapsed += ms; }, log: (line) => logs.push(line),
      fetchImpl: async () => response(++calls < 3 ? 404 : 200),
    }), true);
    assert.equal(calls, 3);
    assert.deepEqual(logs, ['Public npm version pending: HTTP 404; processing age 0ms.',
      'Public npm version pending: HTTP 404; processing age 10ms.']);
  });

  it('fails at the deadline for a permanently missing version', async () => {
    let elapsed = 0;
    let calls = 0;
    await assert.rejects(verifyPublicVersion(manifest, packed, {
      waitMs: 25, intervalMs: 10, now: () => elapsed, log: () => {},
      pause: async (ms) => { elapsed += ms; }, fetchImpl: async () => { calls++; return response(404); },
    }), /processing deadline/);
    assert.equal(elapsed, 25);
    assert.equal(calls, 3);
  });

  it('counts transport time against the deadline even when metadata becomes ready', async () => {
    let elapsed = 0;
    await assert.rejects(verifyPublicVersion(manifest, packed, { waitMs: 20,
      now: () => elapsed, fetchImpl: async () => { elapsed += 21; return response(200); },
    }), /processing deadline/);
  });

  for (const status of [301, 401, 403, 429, 500, 503]) {
    it(`fails closed immediately on HTTP ${status}`, async () => {
      let calls = 0;
      await assert.rejects(verifyPublicVersion(manifest, packed, { waitMs: 30, now: () => 0,
        fetchImpl: async () => { calls++; return response(status); },
        pause: async () => { assert.fail('must not wait for permanent registry errors'); },
      }), new RegExp(`HTTP ${status}`));
      assert.equal(calls, 1);
    });
  }

  it('never treats null or array HTTP 200 metadata as a missing version', async () => {
    for (const data of [null, []]) {
      await assert.rejects(verifyPublicVersion(manifest, packed, { fetchImpl: async () => response(200, data) }), /invalid published metadata/);
    }
  });

  it('fails closed on transport failure and malformed JSON', async () => {
    await assert.rejects(verifyPublicVersion(manifest, packed, {
      fetchImpl: async () => { throw new Error('transport failed'); },
    }), /transport failed/);
    await assert.rejects(verifyPublicVersion(manifest, packed, {
      fetchImpl: async () => new Response('not JSON'),
    }), SyntaxError);
  });

  for (const [field, changed] of [
    ['name', { name: 'foreign' }], ['version', { version: '0.0.0' }],
    ['repository', { repository: { url: 'https://example.com/foreign' } }],
    ['artifact', { dist: { integrity: 'sha512-ZGlmZmVyZW50' } }],
  ]) {
    it(`fails closed on ${field} mismatch during processing`, async () => {
      await assert.rejects(verifyPublicVersion(manifest, packed, { waitMs: 30, now: () => 0,
        fetchImpl: async () => response(200, { ...metadata, ...changed }),
        pause: async () => { assert.fail('must not wait on mismatched metadata'); },
      }), new RegExp(`${field} differs`));
    });
  }

  it('rejects package selectors that could escape the fixed endpoint', async () => {
    const fetchImpl = async () => { assert.fail('invalid selectors must not be fetched'); };
    for (const changed of [{ name: '../foreign' }, { name: 'https://example.com' }, { version: 'latest' }]) {
      await assert.rejects(readPublishedVersion({ ...manifest, ...changed }, { fetchImpl }));
    }
  });
});
