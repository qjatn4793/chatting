import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8080', ws: true, changeOrigin: true }
    }
  },
  resolve: {
    alias: { '@': '/src' }
  },
  // 👇 dev & build 모두에서 global 을 치환
  define: {
    global: 'window',
  },
  // 👇 의존성 사전번들 시에도 esbuild가 global을 인식하게
  optimizeDeps: {
    include: ['@stomp/stompjs', 'sockjs-client', 'react-router-dom'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
})
