import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const esm = new URL('dist/esm/', root);
const cjs = new URL('dist/cjs/', root);

await Promise.all([
  mkdir(esm, { recursive: true }),
  mkdir(cjs, { recursive: true }),
]);
await copyFile(new URL('src/yuka.d.ts', root), new URL('yuka.d.ts', esm));

const indexUrl = new URL('index.d.ts', esm);
const index = await readFile(indexUrl, 'utf8');
const reference = '/// <reference path="./yuka.d.ts" />\n';
if (!index.startsWith(reference)) {
  await writeFile(indexUrl, `${reference}${index}`);
}

await writeFile(new URL('package.json', cjs), '{"type":"commonjs"}\n');
