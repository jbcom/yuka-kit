import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { validateReleaseWorkflows } from './release-workflow-contract.mjs';
import { assertPublishedArtifact } from './verify-published-artifact.mjs';

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
    assert.throws(() => validateReleaseWorkflows({ ci, release, publish: publish.replaceAll('node scripts/verify-published-artifact.mjs', '') }), /artifact identity and integrity/);
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
    ['publish', 'E404', 'E000'],
    ['publish', 'echo "publish=false"', 'echo "publish=true"'],
    ['publish', 'Verify public registry publication', 'No registry check'],
    ['publish', '--userconfig=/dev/null', '--userconfig=./auth'],
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
