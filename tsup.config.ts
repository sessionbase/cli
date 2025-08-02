import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/mcp.ts'],
  format: ['esm'],
  dts: true,
  external: ['react-devtools-core'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
  },
  target: 'es2022',
  platform: 'node',
  minify: false,
  sourcemap: false,
  clean: true
});