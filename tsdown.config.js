// tsdown configuration (ESM).
// Using .js instead of .ts to avoid the optional `unrun` dependency
// required to load TypeScript config files in git-source installs.
//
// Two artifacts with different module semantics:
// - lib/index.js (Host, ESM): loaded by the profile's Node process.
// - lib/client.js (Client): the Harness client-module registry concatenates
//   every plugin's client bundle into one `/plugins` script that it serves to
//   the renderer, so each bundle must self-register through
//   `window.__ModuleLoader__.load()` and resolve its externals (`react`,
//   app packages) through the loader's `require`. A plain ESM output breaks
//   that composition with "Cannot use import statement outside a module".
//   `@deepseek-ai/dsh-client-store` ships no client module of its own, so
//   `createSnapshotStore` is bundled into the client artifact instead of
//   being left external.

/** @type {import('tsdown').Config[]} */
export default [
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'lib',
    target: 'es2022',
    platform: 'neutral',
    external: [/^@deepseek-ai\//, /^node:/],
  },
  {
    entry: { client: 'src/client/index.ts' },
    format: ['cjs'],
    // package.json "type": "module" makes tsdown emit .cjs for CJS output,
    // but the Harness client-module registry composes the bundle from the
    // exact path `lib/client.js`.
    outExtensions: () => ({ js: '.js' }),
    dts: false,
    sourcemap: true,
    outDir: 'lib',
    target: 'es2022',
    platform: 'browser',
    // The bundled store deps (immer/zustand) read process.env.NODE_ENV; the
    // renderer has no `process` global.
    define: { 'process.env.NODE_ENV': '"production"' },
    external: ['react', 'react/jsx-runtime', 'react-dom'],
    banner: {
      js: 'window.__ModuleLoader__.load({ id: "dsh-commandcode", factory: (require) => {\n'
        + 'var module = { exports: {} };\n'
        + 'var exports = module.exports;\n',
    },
    footer: {
      js: '\nreturn module.exports;\n}});',
    },
  },
]
