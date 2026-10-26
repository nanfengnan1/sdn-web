import { defineConfig } from '@vben/vite-config';
export default defineConfig(async () => ({
  application: { nitroMock: false, archiver: false, pwa: false, devtools: false, injectAppLoading: false },
  vite: { server: { port: 15173, proxy: { '/api': { target: 'http://127.0.0.1:18080', changeOrigin: true } } } },
}));
