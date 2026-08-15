const ownEntries = (value) => Object.entries(value ?? {});

export const installedPackageNames = (manifest) => new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
]);

export const collectRuntimeEdges = (manifest, installedNames) => {
  const edges = new Map();
  const skippedOptionalPeers = [];

  for (const [name, spec] of ownEntries(manifest.dependencies)) {
    edges.set(name, { kind: 'dependency', name, spec });
  }
  for (const [name, spec] of ownEntries(manifest.optionalDependencies)) {
    edges.set(name, { kind: 'optional-dependency', name, spec });
  }
  for (const [name, spec] of ownEntries(manifest.peerDependencies)) {
    const optional = manifest.peerDependenciesMeta?.[name]?.optional === true;
    if (!optional) {
      if (!edges.has(name)) edges.set(name, { kind: 'required-peer', name, spec });
      continue;
    }
    if (installedNames.has(name)) {
      if (!edges.has(name)) edges.set(name, { kind: 'installed-optional-peer', name, spec });
    } else {
      skippedOptionalPeers.push(name);
    }
  }

  return {
    edges: [...edges.values()].sort((left, right) => left.name.localeCompare(right.name)),
    skippedOptionalPeers: skippedOptionalPeers.sort(),
  };
};

export const highestVersionFromNpmView = (value, label) => {
  const versions = Array.isArray(value) ? value : [value];
  const version = versions.at(-1);
  if (typeof version !== 'string' || version.length === 0) {
    throw new TypeError(`${label} did not resolve to a public npm version`);
  }
  return version;
};

export const assertPublicRegistryEdge = ({ name, spec }) => {
  if (name.startsWith('@arcade-cabinet/')) {
    throw new Error(`temporary public oracle refuses private-package edge ${name}`);
  }
  if (typeof spec !== 'string' || spec.length === 0 || /^(?:file|git|https?|link|workspace):/.test(spec)) {
    throw new Error(`temporary public oracle cannot prove ${name}@${String(spec)} against npm latest`);
  }
};
