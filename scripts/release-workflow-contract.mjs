const requireText = (source, text, label = text) => {
  if (!source.includes(text)) throw new Error(`workflow contract is missing ${label}`);
};
const forbidText = (source, text, label = text) => {
  if (source.includes(text)) throw new Error(`workflow contract forbids ${label}`);
};
const requireOrder = (source, labels) => {
  let previous = -1;
  for (const label of labels) {
    const position = source.indexOf(label);
    if (position < 0 || position <= previous) throw new Error(`missing or out of order: ${label}`);
    previous = position;
  }
};

/** The publisher executes only a release tag from the trusted Release run. */
export const validateReleaseWorkflows = ({ ci, release, publish }) => {
  for (const [name, workflow] of [['ci', ci], ['cd', publish]]) {
    requireText(workflow, 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', `${name}: SHA-pinned checkout`);
    requireText(workflow, 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020', `${name}: SHA-pinned setup-node`);
    requireText(workflow, 'persist-credentials: false', `${name}: credential-free checkout`);
    forbidText(workflow, 'persist-credentials: true', `${name}: persisted checkout credential`);
    requireText(workflow, 'pnpm install --frozen-lockfile', `${name}: frozen lockfile`);
    requireText(workflow, 'runs-on: ubuntu-24.04', `${name}: pinned runner`);
  }
  for (const workflow of [ci, release, publish]) {
    forbidText(workflow, 'NPM_' + 'TOKEN', 'long-lived npm credential');
    forbidText(workflow, 'NODE_AUTH_TOKEN', 'npm auth token');
    forbidText(workflow, 'npm config set', 'persistent npm auth configuration');
    forbidText(workflow, '//registry.npmjs.org/:_authToken=', 'inlined registry credential');
    forbidText(workflow, 'redacted-private-registry.example', 'private registry');
    forbidText(workflow, 'GITEA_TOKEN', 'private registry credential');
  }
  requireText(ci, 'permissions:\n  contents: read', 'least-privilege CI');
  forbidText(ci, 'id-token: write', 'provenance permission in CI');
  forbidText(ci, 'npm publish', 'publication from CI');
  forbidText(ci, 'pnpm publish', 'publication from CI');
  requireText(ci, 'node: ["22", "24", "26"]', 'supported Node major matrix');
  requireText(ci, 'node-version: ${{ matrix.node }}', 'matrix Node setup');
  requireText(ci, 'git diff --exit-code pnpm-lock.yaml', 'lockfile drift check');
  requireText(ci, 'run: pnpm verify', 'full CI verification');
  requireText(ci, 'name: CI / gate', 'standard CI gate');
  requireText(ci, 'needs: [verify, pre-commit, legacy-verify]', 'all CI jobs aggregated');
  requireText(ci, 'test "$LEGACY_VERIFY_RESULT" = success', 'legacy check cannot be skipped');
  requireText(ci, 'if: always()', 'gate runs after failures');
  requireText(ci, 'test "$VERIFY_RESULT" = success', 'verification cannot be skipped');
  requireText(ci, 'test "$PRE_COMMIT_RESULT" = success', 'pre-commit cannot be skipped');

  requireText(release, 'googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7', 'SHA-pinned release-please');
  requireText(release, 'contents: write', 'release write permission');
  requireText(release, 'pull-requests: write', 'release PR permission');
  forbidText(release, '  publish:', 'second publishing job');
  forbidText(release, 'npm publish', 'publication from release-please');
  forbidText(release, 'pnpm publish', 'publication from release-please');
  forbidText(release, 'workflow_dispatch:\n  inputs:', 'hand-entered release input');

  requireText(publish, 'workflows: [CI, Release]', 'trusted workflow completion trigger');
  requireText(publish, 'branches: [main]', 'trusted main branch');
  requireText(publish, "github.event.workflow_run.event == 'push'", 'Pages only from push CI');
  requireText(publish, 'github.event.workflow_run.head_repository.full_name == github.repository', 'Pages only from this repository');
  forbidText(publish, '\nconcurrency:', 'shared workflow concurrency queue');
  const publishJob = publish.slice(publish.indexOf('  publish:'));
  requireText(publishJob, 'group: npm-publish-${{ github.event.workflow_run.head_sha }}', 'independent queue per release commit');
  requireText(publishJob, "if: github.event.workflow_run.name == 'Release' && github.event.workflow_run.conclusion == 'success'", 'successful Release gate');
  requireText(publishJob, 'select(.target_commitish ==', 'release bound to trusted commit');
  requireText(publishJob, 'HEAD_SHA: ${{ github.event.workflow_run.head_sha }}', 'trusted release SHA');
  requireText(publishJob, 'ref: ${{ steps.release.outputs.tag }}', 'checkout of released tag');
  requireText(publishJob, 'node-version-file: .nvmrc', 'major-only publish toolchain');
  requireText(publishJob, 'permissions:\n      contents: read\n      id-token: write', 'OIDC provenance permission');
  requireText(publishJob, "      - if: steps.release.outputs.tag != ''\n        run: pnpm install --frozen-lockfile", 'tag-gated install');
  requireText(publishJob, "      - if: steps.release.outputs.tag != ''\n        run: pnpm verify", 'full gate before publication');
  requireText(publishJob, "      - name: Check the registry\n        id: registry\n        if: steps.release.outputs.tag != ''", 'tag-gated registry check');
  requireText(publishJob, 'already on npm', 'skip already-published version');
  requireText(publishJob, 'echo "publish=false"', 'skip output');
  requireText(publishJob, 'E404', 'missing version distinguished from registry failure');
  requireText(publishJob, 'echo "publish=true"', 'new version output');
  requireText(publishJob, 'node scripts/verify-published-artifact.mjs', 'published artifact identity and integrity');
  requireText(publishJob, "      - name: Publish\n        if: steps.registry.outputs.publish == 'true'\n        run: npm publish --access public --provenance", 'OIDC publication gated by registry');
  if (publishJob.split('run: npm publish').length !== 2) throw new Error('single publication command required');
  requireText(publishJob, "      - name: Verify public registry publication\n        if: steps.registry.outputs.publish == 'true'", 'anonymous post-publish verification');
  requireText(publishJob, 'version --registry=https://registry.npmjs.org --userconfig=/dev/null', 'anonymous public registry lookup');
  requireOrder(publishJob, ['ref: ${{ steps.release.outputs.tag }}', 'pnpm install --frozen-lockfile', 'pnpm verify', 'id: registry', 'run: npm publish', 'Verify public registry publication']);
};
