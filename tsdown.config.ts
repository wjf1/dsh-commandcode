import { defineConfig } from 'tsdown'

// Two artifacts with different module semantics (see tsdown.config.js for the
// rationale):
// - lib/index.js (Host, ESM): loaded by the profile's Node process.
// - lib/client.js (Client): self-registers through
//   `window.__ModuleLoader__.load()` and resolves externals through the
//   loader's `require`; `@deepseek-ai/dsh-client-store` is bundled in.
export default defineConfig([
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
])
