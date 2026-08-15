const fail = (message) => {
  throw new Error(message);
};

const requireText = (source, text, label = text) => {
  if (!source.includes(text)) fail(`workflow contract is missing ${label}`);
};

const forbidText = (source, text, label = text) => {
  if (source.includes(text)) fail(`workflow contract forbids ${label}`);
};

const requireCount = (source, text, minimum, label = text) => {
  const count = source.split(text).length - 1;
  if (count < minimum) fail(`workflow contract needs ${minimum} occurrence(s) of ${label}; found ${count}`);
};

const requireExactCount = (source, text, expected, label = text) => {
  const count = source.split(text).length - 1;
  if (count !== expected) fail(`workflow contract needs exactly ${expected} occurrence(s) of ${label}; found ${count}`);
};

const requireOrder = (source, labels) => {
  let previous = -1;
  for (const label of labels) {
    const position = source.indexOf(label);
    if (position < 0) fail(`workflow contract is missing ${label}`);
    if (position <= previous) fail(`${label} is out of order`);
    previous = position;
  }
};

const sectionBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) fail(`cannot isolate workflow section ${start}`);
  return source.slice(startIndex, endIndex);
};

export const validateReleaseWorkflows = ({ ci, publish }) => {
  for (const workflow of [ci, publish]) {
    requireText(workflow, 'actions/checkout@v7');
    requireText(workflow, 'persist-credentials: false');
    requireText(workflow, 'actions/setup-node@v7');
    requireText(workflow, 'node-version: 24.19.0');
    requireText(workflow, 'pnpm@11.21.0');
    requireText(workflow, 'pnpm install --frozen-lockfile');
    requireText(workflow, 'npm pack --dry-run --json');
  }
  requireText(ci, 'package_version="$(node -p "require(\'./package.json\').version")"');
  requireText(ci, 'process.argv[2]', 'CI dry-run version argument');
  forbidText(ci, "report[0].version !== '0.19.1'", 'hard-coded CI package version');

  const releaseMarker = '\n  release:\n';
  const releaseIndex = publish.indexOf(releaseMarker);
  if (releaseIndex < 0) fail('minimal release job is missing');
  const packageJob = publish.slice(0, releaseIndex);
  const releaseJob = publish.slice(releaseIndex);
  const sourceStep = sectionBetween(
    packageJob,
    '- id: source',
    '- name: Install exact dependencies',
  );
  const packagePublishStep = sectionBetween(
    packageJob,
    '- name: Publish the already packed bytes, or prove an identical retry',
    '- id: registry',
  );

  requireText(publish, 'group: publish-ai-yuka-package', 'fixed package-wide concurrency');
  forbidText(publish, 'group: publish-tagged-package-${{ inputs.tag }}', 'tag-scoped publish concurrency');
  requireText(publish, 'expected_tag_object:');
  requireText(publish, 'test "${tag_object}" = "${EXPECTED_TAG_OBJECT}"');
  forbidText(packageJob, 'git fetch', 'unauthenticated private-repository fetch');
  forbidText(packageJob, 'FETCH_HEAD', 'unavailable unauthenticated FETCH_HEAD proof');
  requireExactCount(publish, '/branches/main', 3, 'authenticated live main Branch API proof');
  requireText(sourceStep, 'GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}');
  requireText(sourceStep, '/branches/main');
  requireText(sourceStep, '--header @-', 'stdin-authenticated source Branch API');
  requireText(sourceStep, 'fetched_main="$(jq -r \'.commit.id\' "${main_json}")"');
  requireText(sourceStep, 'test "${fetched_main}" = "${head_commit}"');
  requireText(sourceStep, 'unset GITEA_TOKEN');
  requireText(packagePublishStep, 'GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}');
  requireText(packagePublishStep, '/branches/main');
  requireText(packagePublishStep, '--header @-', 'stdin-authenticated pre-publish Branch API');
  requireText(
    packagePublishStep,
    'test "$(jq -r \'.commit.id\' "${main_json}")" = "${head_commit}"',
    'pre-publish live main equality',
  );
  forbidText(publish, 'merge-base --is-ancestor', 'ancestor-only source proof');

  requireOrder(publish, [
    'Prove immutable source identity and exact remote main',
    'Verify dependency currency, source, behavior, builds, and package entry points',
    'Inspect the publishable package without creating an artifact',
    'Pack exactly one immutable artifact',
    'Publish the already packed bytes, or prove an identical retry',
    'Prove anonymous metadata, bytes, and fresh root, Solo, and Koota consumers',
    'release:',
    'Create Gitea Release after package proof',
  ]);
  const publishCommand = publish.indexOf('pnpm publish "${{ steps.pack.outputs.tarball }}"');
  const finalMainProbe = packagePublishStep.lastIndexOf('/branches/main');
  const unsetTokens = packagePublishStep.indexOf('unset PRIVATE_NPM_PUBLISH_TOKEN GITEA_TOKEN');
  const scopedPublish = packagePublishStep.indexOf('NPM_CONFIG_USERCONFIG="${auth_config}"');
  if (
    publishCommand < 0 ||
    finalMainProbe < 0 ||
    unsetTokens < finalMainProbe ||
    scopedPublish < unsetTokens
  ) {
    fail('authenticated exact-main proof and token unsets must immediately precede publication');
  }

  requireText(publish, 'auth_config="$(umask 077; mktemp "${RUNNER_TEMP}/ai-yuka-publish-auth.XXXXXX")"');
  requireText(publish, 'trap cleanup EXIT HUP INT TERM');
  requireText(publish, 'chmod 600 "${auth_config}"');
  requireText(publish, 'test "$(stat -c \'%a\' "${auth_config}")" = 600');
  requireText(publish, 'NPM_CONFIG_USERCONFIG="${auth_config}"');
  requireText(
    packagePublishStep,
    'unset PRIVATE_NPM_PUBLISH_TOKEN GITEA_TOKEN\n            NPM_CONFIG_USERCONFIG="${auth_config}"',
    'token unsets immediately before the pnpm child',
  );
  requireCount(publish, '--header @-', 6, 'stdin-fed authorization header');
  forbidText(publish, 'pnpm config set', 'persistent pnpm auth configuration');
  forbidText(publish, '--header "Authorization: token', 'secret-bearing curl argument');

  requireText(packageJob, 'PRIVATE_NPM_PUBLISH_TOKEN: ${{ secrets.PRIVATE_NPM_PUBLISH_TOKEN }}');
  requireText(packageJob, 'permissions:\n      contents: read');
  requireExactCount(packageJob, 'GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}', 2, 'step-scoped read token');
  requireExactCount(packageJob, 'PRIVATE_NPM_PUBLISH_TOKEN: ${{ secrets.PRIVATE_NPM_PUBLISH_TOKEN }}', 1);
  const packageOutsideAuthorizedSteps = packageJob
    .replace(sourceStep, '')
    .replace(packagePublishStep, '');
  forbidText(packageOutsideAuthorizedSteps, 'GITEA_TOKEN:', 'Gitea token outside its proof steps');
  forbidText(
    packageOutsideAuthorizedSteps,
    'PRIVATE_NPM_PUBLISH_TOKEN:',
    'package token outside the publish step',
  );
  requireText(releaseJob, 'needs: publish');
  requireText(releaseJob, 'permissions:\n      # This job has no checkout and no npm credential.');
  requireText(releaseJob, 'contents: write');
  requireText(releaseJob, 'GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}');
  requireExactCount(releaseJob, 'GITEA_TOKEN: ${{ secrets.GITEA_TOKEN }}', 1, 'release-step write token');
  forbidText(releaseJob, 'PRIVATE_NPM_PUBLISH_TOKEN', 'package token in release job');
  forbidText(releaseJob, 'actions/checkout', 'checkout in minimal release job');
  forbidText(releaseJob, 'pnpm ', 'npm tooling in minimal release job');
  requireText(releaseJob, '/branches/main');
  requireText(releaseJob, '.commit.id == $commit', 'live main equality before Release');
  requireText(releaseJob, '/git/refs/tags%2F${RELEASE_TAG}');
  requireText(releaseJob, '/git/tags/${EXPECTED_TAG_OBJECT}');
  requireText(
    releaseJob,
    '.tag == $tag and .sha == $tag_object and .object.type == "commit" and .object.sha == $commit',
    'annotated tag object and peel equality',
  );
  requireText(releaseJob, '- Annotated tag object: ${EXPECTED_TAG_OBJECT}');
  requireText(releaseJob, '(.body | contains($tag_object))');

  requireText(publish, 'test "${actual_sha256}" = "${EXPECTED_SHA256}"');
  requireText(publish, 'test "${actual_tar_sha256}" = "${EXPECTED_TAR_SHA256}"');
  requireText(publish, 'npm_config_ignore_scripts=true');
  requireText(publish, 'cmp --silent "${{ steps.pack.outputs.tarball }}" "${downloaded_tarball}"');
  requireText(publish, 'test ! -e "${consumer_dir}/node_modules/koota"');
  requireText(publish, '@arcade-cabinet/ai-yuka/solo');
  requireText(publish, '@arcade-cabinet/ai-yuka/koota');
};
