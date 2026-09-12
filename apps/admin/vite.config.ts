import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { TDesignResolver } from '@tdesign-vue-next/auto-import-resolver'
import { fileURLToPath, URL } from 'node:url'

// 相对 base：dist 产物可直接静态托管或本地打开
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    Components({
      resolvers: [TDesignResolver({ library: 'vue-next' })],
      dts: false,
    }),
  ],
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
  build: {
    /* wangEditor 是只在编辑弹窗打开后请求的独立块；它自身约 812 kB，按异步块预算单独告警。 */
    chunkSizeWarningLimit: 850,
    rollupOptions: {
      output: {
        /* 富文本编辑器仅在表单弹窗实际打开后加载。TDesign 由自动导入插件按组件拆分。 */
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-editor': ['@wangeditor/editor', '@wangeditor/editor-for-vue'],
        },
      },
    },
  },
})
