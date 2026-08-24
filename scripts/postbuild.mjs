import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const esm = new URL('dist/esm/', root);
const cjs = new URL('dist/cjs/', root);

await Promise.all([
  mkdir(esm, { recursive: true }),
  mkdir(cjs, { recursive: true }),
]);
await copyFile(new URL('src/yuka.d.ts', root), new URL('yuka.d.ts', esm));

const prependReference = async (path, referencePath) => {
  const indexUrl = new URL(path, esm);
  const index = await readFile(indexUrl, 'utf8');
  const reference = `/// <reference path="${referencePath}" />\n`;
  if (!index.startsWith(reference)) await writeFile(indexUrl, `${reference}${index}`);
};

await Promise.all([
  prependReference('index.d.ts', './yuka.d.ts'),
  prependReference('koota/index.d.ts', '../yuka.d.ts'),
  prependReference('solo/index.d.ts', '../yuka.d.ts'),
]);

const copyCjsDeclarations = async (directory = '') => {
  const source = new URL(directory, esm);
  const destination = new URL(directory, cjs);
  await mkdir(destination, { recursive: true });

  for (const entry of await readdir(source, { withFileTypes: true })) {
    const relative = `${directory}${entry.name}`;
    if (entry.isDirectory()) {
      await copyCjsDeclarations(`${relative}/`);
    } else if (entry.name.endsWith('.d.ts')) {
      const declaration = await readFile(new URL(relative, esm), 'utf8');
      // Declaration imports are emitted as .js for the ESM graph. In a .d.cts
      // graph, TypeScript resolves the matching CommonJS declarations via .cjs.
      const cjsDeclaration = declaration
        .replace(/\.js(['"])/g, '.cjs$1')
        .replace(/\.d\.ts(['"])/g, '.d.cts$1');
      await writeFile(new URL(relative.replace(/\.d\.ts$/, '.d.cts'), cjs), cjsDeclaration);
    }
  }
};

// The CommonJS export conditions need CommonJS declarations. Copying the
// compiler's declaration graph preserves every relative type import while the
// .d.cts extension tells TypeScript to resolve it as the require branch.
await copyCjsDeclarations();
await writeFile(new URL('package.json', cjs), '{"type":"commonjs"}\n');
