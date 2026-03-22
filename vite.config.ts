import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function proxyLogger(tag: string) {
  return (proxy: { on: Function }) => {
    proxy.on('error', (err: Error, _req: unknown, res: any) => {
      console.error(`[${tag}] error:`, err.message);
      if (res && 'writeHead' in res) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end(`${tag} proxy error: ${err.message}`);
      }
    });
    proxy.on('proxyReq', (_proxyReq: unknown, req: any) => {
      console.log(`[${tag}] →`, req.method, req.url, 'content-length:', req.headers['content-length']);
    });
    proxy.on('proxyRes', (proxyRes: any, req: any) => {
      console.log(`[${tag}] ←`, proxyRes.statusCode, req.url);
    });
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ws/pty': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
      '/health': {
        target: 'http://127.0.0.1:3001',
      },
      '/api/boson': {
        target: 'https://hackathon.boson.ai',
        changeOrigin: true,
        timeout: 60_000,
        rewrite: (path) => path.replace(/^\/api\/boson/, ''),
        configure: proxyLogger('boson-proxy'),
      },
      '/api/eigen': {
        target: 'https://api-web.eigenai.com',
        changeOrigin: true,
        timeout: 60_000,
        rewrite: (path) => path.replace(/^\/api\/eigen/, ''),
        configure: proxyLogger('eigen-proxy'),
      },
      '/api/mistral': {
        target: 'https://api.mistral.ai',
        changeOrigin: true,
        timeout: 120_000,
        rewrite: (path) => path.replace(/^\/api\/mistral/, ''),
        configure: proxyLogger('mistral-proxy'),
      },
    },
  },
})
