import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/client/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
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
})
