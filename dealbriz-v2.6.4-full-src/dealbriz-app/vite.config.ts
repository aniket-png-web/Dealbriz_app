import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'apk-downloader-middleware',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const cleanUrl = req.url?.split('?')[0];
            if (cleanUrl === '/dealbriz.apk' || cleanUrl === '/app-debug.apk') {
              const apkPath = path.resolve(__dirname, 'public/dealbriz.apk');
              if (fs.existsSync(apkPath)) {
                const stat = fs.statSync(apkPath);
                res.setHeader('Content-Type', 'application/vnd.android.package-archive');
                res.setHeader('Content-Disposition', 'attachment; filename="dealbriz.apk"');
                res.setHeader('Content-Length', stat.size);
                res.setHeader('Cache-Control', 'public, max-age=3600');
                const stream = fs.createReadStream(apkPath);
                stream.pipe(res);
                return;
              }
            }
            next();
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'https://dealbriz.com',
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Referer', 'https://dealbriz.com/');
              proxyReq.setHeader('Origin', 'https://dealbriz.com');
            });
            proxy.on('proxyRes', (proxyRes) => {
              // Strip upstream restrictive CORS & frame headers so browser on cloud run can read responses without CORS failures
              delete proxyRes.headers['access-control-allow-origin'];
              delete proxyRes.headers['access-control-allow-credentials'];
              delete proxyRes.headers['access-control-expose-headers'];
              delete proxyRes.headers['x-frame-options'];
              delete proxyRes.headers['content-security-policy'];
            });
            proxy.on('error', (err, _req, res) => {
              if (res && !(res as any).headersSent && (res as any).writeHead) {
                (res as any).writeHead(200, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({ error: 'Proxy offline', items: [], faqs: [] }));
              }
            });
          },
        },
      },
    },
  };
});
