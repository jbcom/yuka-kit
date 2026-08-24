import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { validateReleaseWorkflows } from './release-workflow-contract.mjs';

const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const publish = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const nvmrc = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim();

describe('release workflow contract', () => {
  it('separates the public Node compatibility range from the exact execution toolchain', () => {
    assert.equal(manifest.engines.node, '>=24');
    assert.equal(nvmrc, '24.19.0');
    // The pinned toolchain must actually satisfy the range consumers are promised.
    assert.ok(Number.parseInt(nvmrc.split('.')[0], 10) >= 24);
  });

  it('publishes publicly with provenance under the extracted name', () => {
    assert.equal(manifest.name, '@jbdevprimary/yuka-kit');
    assert.equal(manifest.publishConfig.access, 'public');
    assert.equal(manifest.publishConfig.provenance, true);
    assert.equal(manifest.license, 'MIT');
  });

  it('accepts the complete hardened workflow', () => {
    assert.doesNotThrow(() => validateReleaseWorkflows({ ci, publish }));
  });

  it('rejects an unpinned or credential-persisting checkout', () => {
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace('actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8', 'actions/checkout@main') }),
      /pinned checkout/,
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci: ci.replace('persist-credentials: false', 'persist-credentials: true'), publish }),
      /credential-free checkout/,
    );
  });

  it('rejects a toolchain that drifts below the declared engines range', () => {
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace('node-version-file: .nvmrc', 'node-version: 22') }),
      /nvmrc-pinned Node|Node pinned below engines/,
    );
  });

  it('rejects publication that skips the verification gate', () => {
    const gateRemoved = publish.replace('      - run: pnpm verify\n', '');
    assert.throws(() => validateReleaseWorkflows({ ci, publish: gateRemoved }), /full gate before publication/);
    const gateAfterPublish = publish
      .replace('      - run: pnpm verify\n', '')
      .replace('      - name: Publish', '      - run: pnpm verify\n      - name: Publish')
      .replace(
        'run: pnpm publish --access public --provenance --no-git-checks',
        'run: pnpm publish --access public --provenance --no-git-checks # moved',
      );
    // Ordering is what makes the gate meaningful, not its mere presence.
    assert.doesNotThrow(() => validateReleaseWorkflows({ ci, publish: gateAfterPublish }));
  });

  it('rejects dropping provenance or publishing privately', () => {
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace('--provenance', '') }),
      /npm provenance/,
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace('id-token: write', 'id-token: none') }),
      /provenance permission/,
    );
  });

  it('rejects an ungated or hand-tagged release', () => {
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace("if: needs.release-please.outputs.released == 'true'", 'if: always()') }),
      /released gate/,
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace('ref: ${{ needs.release-please.outputs.tag }}', 'ref: main') }),
      /checkout of the released tag/,
    );
  });

  it('rejects credential leakage into CI or a second publish path', () => {
    assert.throws(
      () => validateReleaseWorkflows({ ci: `${ci}\n      - run: pnpm publish\n`, publish }),
      /publication from CI/,
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace('    steps:\n      - id: release', '    env:\n      NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}\n    steps:\n      - id: release') }),
      /publish credential in the release-please job|exactly 1 occurrence/,
    );
  });

  it('rejects any surviving private-registry or pre-extraction reference', () => {
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: publish.replace('registry-url: https://registry.npmjs.org', 'registry-url: https://redacted-private-registry.example/api/packages/arcade-cabinet/npm/') }),
      /private Gitea registry/,
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci: `${ci}\n      # @arcade-cabinet/ai-yuka\n`, publish }),
      /pre-extraction package scope/,
    );
  });
});
