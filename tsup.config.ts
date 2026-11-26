import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'electron/index': 'src/electron/index.ts',
    'refresh/index': 'src/refresh/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'node20',
  external: ['electron'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
