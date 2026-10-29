import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'

const root = resolve(import.meta.dirname, '..')
const api = resolve(root, 'apps/api')
const mode = process.argv[2]
if (!['start', 'test'].includes(mode)) throw new Error('用法：node scripts/integration.mjs <start|test>')
if (mode === 'test') {
  const result = spawnSync(process.execPath, [resolve(api, 'scripts/integration.mjs'), 'test'], { cwd: api, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} else {
  const env = { ...process.env, ...parseEnv(readFileSync(resolve(api, '.env.it'), 'utf8')), NODE_ENV: 'test', UPLOAD_DIR: resolve(api, '.tmp/integration-uploads'), PAYMENT_CONFIG_KEY_FILE: resolve(api, '.tmp/integration-private/wechatpay-config.key') }
  const result = spawnSync(process.execPath, [resolve(api, 'scripts/integration.mjs'), 'prepare'], { cwd: api, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  const { startAll } = await import('./workspace.mjs')
  await startAll(env)
}
