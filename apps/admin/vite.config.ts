import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 相对 base：dist 产物可直接静态托管或本地打开
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0', // 允许局域网访问
    port: 7758,
    strictPort: true, // 端口被占用时直接报错，不悄悄换端口
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7757',
        changeOrigin: true,
      },
    },
  },
})
