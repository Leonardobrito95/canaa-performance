import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: '/bdr/',
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/bdr/api': {
        target: 'http://localhost:3099',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bdr/, ''),
      },
      '/api': {
        target: 'http://localhost:3099',
        changeOrigin: true,
      },
    },
  },
});
