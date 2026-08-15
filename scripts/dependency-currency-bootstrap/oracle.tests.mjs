import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertPublicRegistryEdge,
  collectRuntimeEdges,
  highestVersionFromNpmView,
  installedPackageNames,
} from './oracle.mjs';

describe('temporary recursive dependency-currency oracle', () => {
  it('includes runtime dependencies, required peers, and installed optional peers only', () => {
    const root = {
      dependencies: { alpha: '1.0.0' },
      optionalDependencies: { bravo: '2.0.0' },
      peerDependencies: { charlie: '3.0.0', delta: '4.0.0', echo: '5.0.0' },
      peerDependenciesMeta: { delta: { optional: true }, echo: { optional: true } },
      devDependencies: { delta: '4.0.0' },
    };
    const result = collectRuntimeEdges(root, installedPackageNames(root));
    assert.deepEqual(result.edges, [
      { kind: 'dependency', name: 'alpha', spec: '1.0.0' },
      { kind: 'optional-dependency', name: 'bravo', spec: '2.0.0' },
      { kind: 'required-peer', name: 'charlie', spec: '3.0.0' },
      { kind: 'installed-optional-peer', name: 'delta', spec: '4.0.0' },
    ]);
    assert.deepEqual(result.skippedOptionalPeers, ['echo']);
  });

  it('reads the highest version selected by npm view', () => {
    assert.equal(highestVersionFromNpmView('2.3.0', 'single'), '2.3.0');
    assert.equal(highestVersionFromNpmView(['2.1.0', '2.3.0'], 'range'), '2.3.0');
    assert.throws(() => highestVersionFromNpmView([], 'empty'), /did not resolve/);
  });

  it('fails closed for private and non-registry edges', () => {
    assert.doesNotThrow(() => assertPublicRegistryEdge({ name: 'yuka', spec: '0.7.8' }));
    assert.throws(
      () => assertPublicRegistryEdge({ name: '@arcade-cabinet/rules', spec: '1.0.0' }),
      /refuses private-package edge/,
    );
    assert.throws(
      () => assertPublicRegistryEdge({ name: 'local-package', spec: 'workspace:*' }),
      /cannot prove/,
    );
  });
});
