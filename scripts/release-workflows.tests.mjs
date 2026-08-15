import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { validateReleaseWorkflows } from './release-workflow-contract.mjs';

const ci = await readFile(new URL('../.gitea/workflows/ci.yml', import.meta.url), 'utf8');
const publish = await readFile(
  new URL('../.gitea/workflows/publish-tagged-package.yml', import.meta.url),
  'utf8',
);
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const nvmrc = (await readFile(new URL('../.nvmrc', import.meta.url), 'utf8')).trim();

describe('immutable release workflow contract', () => {
  it('separates the public Node compatibility range from the exact execution toolchain', () => {
    assert.equal(manifest.engines.node, '>=24');
    assert.equal(nvmrc, '24.19.0');
  });

  it('accepts the complete hardened workflow', () => {
    assert.doesNotThrow(() => validateReleaseWorkflows({ ci, publish }));
  });

  it('rejects an advanced-main race in the publish or retry-to-Release path', () => {
    const withoutPrepublishMainEquality = publish.replace(
      'test "$(jq -r \'.commit.id\' "${main_json}")" = "${head_commit}"',
      'true # hostile mutation removed pre-publish main equality',
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: withoutPrepublishMainEquality }),
      /pre-publish live main equality|exact-main/,
    );
    const withoutReleaseMain = publish.replace(
      '.name == "main" and .commit.id == $commit',
      '.name == "main"',
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: withoutReleaseMain }),
      /live main equality/,
    );
  });

  it('rejects unauthenticated private-repository fetch regressions', () => {
    const mutated = publish.replace(
      'fetched_main="$(jq -r \'.commit.id\' "${main_json}")"',
      'git fetch origin main --no-tags',
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: mutated }),
      /unauthenticated private-repository fetch/,
    );
  });

  it('rejects tag-scoped concurrency', () => {
    const mutated = publish.replace(
      'group: publish-ai-yuka-package',
      'group: publish-tagged-package-${{ inputs.tag }}',
    );
    assert.throws(() => validateReleaseWorkflows({ ci, publish: mutated }), /package-wide concurrency/);
  });

  it('rejects credential persistence or cleanup removal', () => {
    const persistent = publish.replace(
      'trap cleanup EXIT HUP INT TERM',
      'true # hostile mutation removed cleanup trap',
    );
    assert.throws(() => validateReleaseWorkflows({ ci, publish: persistent }), /trap cleanup/);
    const wrongMode = publish.replace('chmod 600 "${auth_config}"', 'chmod 644 "${auth_config}"');
    assert.throws(() => validateReleaseWorkflows({ ci, publish: wrongMode }), /chmod 600/);
  });

  it('rejects broader Gitea token exposure or inherited publish secrets', () => {
    const jobScoped = publish.replace(
      '    env:\n      RELEASE_TAG:',
      '    env:\n      GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}\n      RELEASE_TAG:',
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: jobScoped }),
      /Gitea token outside its proof steps|exactly 2 occurrence/,
    );
    const inheritedByPnpm = publish.replace(
      'unset PRIVATE_NPM_PUBLISH_TOKEN GITEA_TOKEN\n            NPM_CONFIG_USERCONFIG="${auth_config}"',
      'NPM_CONFIG_USERCONFIG="${auth_config}"\n            unset PRIVATE_NPM_PUBLISH_TOKEN GITEA_TOKEN',
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: inheritedByPnpm }),
      /token unsets|immediately precede publication/,
    );
  });

  it('rejects an annotated-tag or existing-Release provenance mismatch', () => {
    const tagMismatch = publish.replace(
      '.object.type == "commit" and .object.sha == $commit',
      '.object.type == "commit" and .object.sha != $commit',
    );
    assert.throws(
      () => validateReleaseWorkflows({ ci, publish: tagMismatch }),
      /annotated tag object and peel equality/,
    );
    const releaseMismatch = publish.replace(
      '- Annotated tag object: ${EXPECTED_TAG_OBJECT}',
      '- Annotated tag object: omitted',
    );
    assert.throws(() => validateReleaseWorkflows({ ci, publish: releaseMismatch }), /Annotated tag object/);
  });
});
