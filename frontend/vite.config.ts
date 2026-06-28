// frontend/vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const targetUrl = env.VITE_API_TARGET || 'http://127.0.0.1:8000';
 

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Позволяет Vite слушать не только localhost, но и поддомены
      host: true, 
      proxy: {
        '/api': {
          target: targetUrl,
          // КРИТИЧЕСКИ ВАЖНО ДЛЯ DJANGO-TENANTS: 
          // Отключаем changeOrigin, чтобы сохранить заголовок Host (company.localhost:5173)
          changeOrigin: false,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              // Берем хост из браузера (например, company.localhost:5173)
              const host = req.headers.host;
              if (host) {
                // Передаем его в Django, чтобы django-tenants понял, какая это компания
                proxyReq.setHeader('X-Forwarded-Host', host);
                // Если Django запущен на 127.0.0.1:8000, нам нужно направить туда сетевой пакет,
                // но сохранить имя хоста.
                proxyReq.setHeader('Host', host.replace('5173', '8000'));
              }
            });
          },
        },
        '/media': {
          target: targetUrl,
          changeOrigin: false,
          secure: false,
        },
         '/ws': {
          target: 'ws://127.0.0.1:8000',
          changeOrigin: false,
          secure: false,
          ws: true,
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              const host = req.headers.host;
              if (host) {
                proxyReq.setHeader('X-Forwarded-Host', host);
                proxyReq.setHeader('Host', host.replace('5173', '8000'));
              }
            });
          },
        },
      },
    },
  };
});