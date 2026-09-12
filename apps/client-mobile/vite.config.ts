import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 7759,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7757',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('tdesign-vue-next')) return 'vendor-tdesktop'
          if (id.includes('tdesign-mobile-vue')) return 'vendor-tmobile'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
