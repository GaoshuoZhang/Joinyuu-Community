// Isolated UI fixture: real admin components; all API modules use in-memory test data.
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { TDesignResolver } from '@tdesign-vue-next/auto-import-resolver'

const adminRoot = fileURLToPath(new URL('../../../', import.meta.url))
const fixture = '/test/fixtures/remediation/'
const server = await createServer({
  configFile: false,
  root: adminRoot,
  resolve: { alias: { '@': resolve(adminRoot, 'src') } },
  plugins: [
    { name: 'isolated-ui-data', enforce: 'pre', load(id) {
      const path = id.replaceAll('\\', '/')
      if (path.endsWith('/src/api/http.ts')) return `export { read as httpGet, write as httpPost, write as httpPut, write as httpPatch, write as httpDelete, write as httpUpload } from '${fixture}data.ts'`
      if (path.endsWith('/src/stores/auth.ts')) return `import { fixtureAuth } from '${fixture}data.ts'; export const useAuthStore = () => fixtureAuth`
    } },
    vue(),
    Components({ resolvers: [TDesignResolver({ library: 'vue-next' })], dts: false }),
  ],
  server: { host: '127.0.0.1', port: 17760, strictPort: true },
})
await server.listen()
process.stdout.write('Isolated UI fixture: http://127.0.0.1:17760/test/fixtures/remediation/index.html\n')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await server.close(); process.exit(0) })
