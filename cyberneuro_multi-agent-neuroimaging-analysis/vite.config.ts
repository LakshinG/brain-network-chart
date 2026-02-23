import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/brain-network-chart/' : '/',
  plugins: [react()],
  server: {
    proxy: {
      '/ollama-api': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama-api/, '')
      }
    }
  },
  build: {
    rollupOptions: {
      external: ["cross-spawn", "which", "mcp-client"]
    }
  }
}))
