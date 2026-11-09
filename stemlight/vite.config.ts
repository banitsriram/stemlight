/**
 * Adapted from the IWSDK starter template.
 * Copyright (c) Meta Platforms, Inc. and affiliates. MIT licence.
 */
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [iwsdkDev()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: { outDir: 'dist', target: 'esnext', rollupOptions: { input: './index.html' } },
  esbuild: { target: 'esnext' },
  resolve: { dedupe: ['three'] },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: ['three'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
