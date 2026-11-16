import { defineConfig } from 'vite';

// base를 './'로 두면 GitHub Pages(/city-36-5/)든 다른 경로든 그대로 열린다.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  server: { host: '127.0.0.1' },
});
