const fail = (message) => {
  throw new Error(message);
};

const requireText = (source, text, label = text) => {
  if (!source.includes(text)) fail(`workflow contract is missing ${label}`);
};

const forbidText = (source, text, label = text) => {
  if (source.includes(text)) fail(`workflow contract forbids ${label}`);
};

const requireExactCount = (source, text, expected, label = text) => {
  const count = source.split(text).length - 1;
  if (count !== expected) {
    fail(`workflow contract needs exactly ${expected} occurrence(s) of ${label}; found ${count}`);
  }
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
  if (startIndex < 0) fail(`cannot isolate workflow section ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : source.length;
  return source.slice(startIndex, endIndex < 0 ? source.length : endIndex);
};

/**
 * Release contract for the GitHub-hosted OSS package.
 *
 * The Gitea ancestor of this file proved immutability by hand: authenticated
 * Branch API probes, SHA-256 equality on the tarball and tar stream, and
 * manually scoped publish tokens. On GitHub that trust model is replaced by
 * release-please (the tag is derived from the merged commit, never typed) plus
 * npm provenance (a signed, publicly verifiable attestation binding the
 * published bytes to this repository and workflow). The invariants below are
 * what still has to be enforced by inspection rather than by the platform.
 */
export const validateReleaseWorkflows = ({ ci, publish }) => {
  for (const [name, workflow] of [
    ['ci', ci],
    ['release', publish],
  ]) {
    // A mutable action reference is a supply-chain hole in a publishing repo.
    requireText(workflow, 'actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8', `${name}: SHA-pinned checkout`);
    requireText(workflow, 'actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444', `${name}: SHA-pinned setup-node`);
    // The toolchain is declared once, in .nvmrc, so it cannot drift from engines.
    requireText(workflow, 'node-version-file: .nvmrc', `${name}: nvmrc-pinned Node`);
    forbidText(workflow, 'node-version: 22', `${name}: Node pinned below engines`);
    // A checkout that keeps its credential leaves a usable token in .git/config.
    requireText(workflow, 'persist-credentials: false', `${name}: credential-free checkout`);
    requireText(workflow, 'pnpm install --frozen-lockfile', `${name}: frozen lockfile`);
    requireText(workflow, 'runs-on: ubuntu-24.04', `${name}: pinned runner`);
  }

  // CI must not be able to publish, and must actually exercise the package.
  requireText(ci, 'permissions:\n  contents: read', 'least-privilege CI permissions');
  forbidText(ci, 'id-token: write', 'provenance permission in CI');
  forbidText(ci, 'NODE_AUTH_TOKEN', 'publish credential in CI');
  forbidText(ci, 'pnpm publish', 'publication from CI');
  forbidText(ci, 'pnpm lint', 'phantom lint script');
  requireText(ci, 'git diff --exit-code pnpm-lock.yaml', 'lockfile drift check');
  requireText(ci, 'publint', 'package linting');
  requireText(ci, '@arethetypeswrong/cli', 'export/type resolution check');

  const releaseJob = sectionBetween(publish, '  release-please:', '  publish:');
  const publishJob = sectionBetween(publish, '  publish:', null);

  // The version and tag come from release-please, never from a typed input.
  requireText(publish, 'googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7', 'SHA-pinned release-please');
  forbidText(publish, 'workflow_dispatch:\n  inputs:', 'hand-entered release input');
  requireText(releaseJob, 'contents: write');
  requireText(releaseJob, 'pull-requests: write');
  forbidText(releaseJob, 'NODE_AUTH_TOKEN', 'publish credential in the release-please job');
  forbidText(releaseJob, 'pnpm publish', 'publication from the release-please job');

  // Publication is gated on a real release and runs the full local gate first.
  requireText(publishJob, 'needs: release-please');
  requireText(publishJob, "if: needs.release-please.outputs.released == 'true'", 'released gate');
  requireText(publishJob, 'ref: ${{ needs.release-please.outputs.tag }}', 'checkout of the released tag');
  requireText(publishJob, 'permissions:\n      contents: read', 'least-privilege publish contents');
  requireText(publishJob, 'id-token: write', 'provenance permission');
  requireText(publishJob, 'pnpm verify', 'full gate before publication');
  requireText(publishJob, '--provenance', 'npm provenance');
  requireText(publishJob, '--access public');
  requireExactCount(publishJob, 'pnpm publish', 1, 'single publication command');

  // The gate must precede the publish, or it proves nothing about the bytes.
  requireOrder(publishJob, ['pnpm install --frozen-lockfile', 'pnpm verify', 'pnpm publish']);

  // The publish credential is scoped to the publish step alone.
  requireExactCount(publish, 'NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}', 1, 'step-scoped npm token');
  forbidText(publish, 'npm config set', 'persistent npm auth configuration');
  forbidText(publish, '//registry.npmjs.org/:_authToken=', 'inlined registry credential');

  // This package is public on npm; the private Gitea scope must not survive.
  for (const workflow of [ci, publish]) {
    forbidText(workflow, 'redacted-private-registry.example', 'private Gitea registry');
    forbidText(workflow, '@arcade-cabinet/', 'pre-extraction package scope');
    forbidText(workflow, 'GITEA_TOKEN', 'Gitea credential');
  }
};
