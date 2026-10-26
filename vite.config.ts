import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,       // binds to 0.0.0.0 — required to be reachable from outside the container
    port: 5173,
    strictPort: true,
    proxy: {
      '/rover-video': {
        target: 'http://172.20.10.3:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rover-video/, '/video'),
      },
      '/rover-api': {
        target: 'http://172.20.10.3:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rover-api/, '/api'),
      },
    },
  },
})