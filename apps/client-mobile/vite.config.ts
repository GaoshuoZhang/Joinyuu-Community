import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

/* 移动端版本号唯一来源：apps/client-mobile/package.json 的 version，构建期注入为编译期常量 __APP_VERSION__
 * （三端锁步发布，版本规则与发布流程见 docs/versioning.md） */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 7759,
    strictPort: true,
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
          if (id.includes('tdesign-mobile-vue')) return 'vendor-tmobile'
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
