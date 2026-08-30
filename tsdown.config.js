// tsdown configuration (ESM).
// Using .js instead of .ts to avoid the optional `unrun` dependency
// required to load TypeScript config files in git-source installs.

/** @type {import('tsdown').Config} */
export default {
  entry: ['src/index.ts', 'src/client/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'lib',
  target: 'es2022',
  platform: 'neutral',
  external: [
    /^@deepseek-ai\//,
    /^node:/,
    'react',
    'react/jsx-runtime',
  ],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    }
  },
}
