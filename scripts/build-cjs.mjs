import { build } from 'esbuild';

const root = new URL('../', import.meta.url);

await Promise.all([
  build({
    absWorkingDir: root.pathname,
    bundle: true,
    entryPoints: ['src/index.ts'],
    external: ['yuka'],
    format: 'cjs',
    outfile: 'dist/cjs/index.js',
    platform: 'node',
    sourcemap: true,
    target: 'node24',
  }),
  build({
    absWorkingDir: root.pathname,
    bundle: true,
    entryPoints: ['src/koota/index.ts'],
    external: ['koota', 'yuka'],
    format: 'cjs',
    outfile: 'dist/cjs/koota/index.js',
    platform: 'node',
    sourcemap: true,
    target: 'node24',
  }),
]);
