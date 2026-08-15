#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPublicRegistryEdge,
  collectRuntimeEdges,
  highestVersionFromNpmView,
  installedPackageNames,
} from './oracle.mjs';

const PUBLIC_REGISTRY = 'https://registry.npmjs.org/';
const root = fileURLToPath(new URL('../../', import.meta.url));
const rootManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const declaredInstalledNames = installedPackageNames(rootManifest);

for (const name of declaredInstalledNames) {
  const manifestPath = join(root, 'node_modules', ...name.split('/'), 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${name} is declared for the repository but not installed; run the frozen install first`);
  }
}

const npmView = (spec, ...fields) => {
  const stdout = execFileSync('npm', [
    'view', spec, ...fields, '--json', `--registry=${PUBLIC_REGISTRY}`,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, npm_config_userconfig: '/dev/null' },
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 120_000,
  });
  return JSON.parse(stdout);
};

const initial = collectRuntimeEdges(rootManifest, declaredInstalledNames);
const queue = initial.edges.map((edge) => ({ ...edge, owner: rootManifest.name }));
const skipped = initial.skippedOptionalPeers.map((name) => `${rootManifest.name} -> ${name}`);
const traversed = new Set();
const verified = [];

while (queue.length > 0) {
  const edge = queue.shift();
  assertPublicRegistryEdge(edge);

  const latest = highestVersionFromNpmView(
    npmView(edge.name, 'dist-tags.latest'),
    `${edge.name} latest`,
  );
  const selected = highestVersionFromNpmView(
    npmView(`${edge.name}@${edge.spec}`, 'version'),
    `${edge.name}@${edge.spec}`,
  );
  if (selected !== latest) {
    throw new Error(
      `${edge.owner} ${edge.kind} ${edge.name}@${edge.spec} selects ${selected}; public npm latest is ${latest}`,
    );
  }
  verified.push({ ...edge, latest });

  const identity = `${edge.name}@${latest}`;
  if (traversed.has(identity)) continue;
  traversed.add(identity);
  const manifest = npmView(identity);
  const nested = collectRuntimeEdges(manifest, declaredInstalledNames);
  queue.push(...nested.edges.map((child) => ({ ...child, owner: identity })));
  skipped.push(...nested.skippedOptionalPeers.map((name) => `${identity} -> ${name}`));
}

verified.sort((left, right) => `${left.owner}/${left.name}`.localeCompare(`${right.owner}/${right.name}`));
for (const edge of verified) {
  console.log(`CURRENT ${edge.owner} ${edge.kind} ${edge.name}@${edge.latest}`);
}
for (const description of skipped.sort()) {
  console.log(`SKIP uninstalled optional peer ${description}`);
}
console.log(`Dependency-current closure passed: ${verified.length} public edge(s), ${traversed.size} package(s).`);
