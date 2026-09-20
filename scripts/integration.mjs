import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { parseEnv } from 'node:util'

const root = resolve(import.meta.dirname, '..')
const envFile = resolve(root, 'apps/api/.env.it')
const mode = process.argv[2]
const pnpm = 'pnpm'
const useShell = process.platform === 'win32'

if (mode !== 'start' && mode !== 'test') {
  throw new Error('用法：node scripts/integration.mjs <start|test>')
}
if (!existsSync(envFile)) {
  throw new Error('缺少 apps/api/.env.it；请先复制 apps/api/env.it.example')
}
Object.assign(process.env, parseEnv(readFileSync(envFile, 'utf8')))

function parseIsolation() {
  const database = new URL(process.env.DATABASE_URL ?? '')
  const databaseName = decodeURIComponent(database.pathname.replace(/^\//, ''))
  if (!/^[A-Za-z0-9_]+$/.test(databaseName) || !/_(?:it|test)$/.test(databaseName)) {
    throw new Error('DATABASE_URL 必须指向名称以 _it 或 _test 结尾的隔离数据库')
  }
  const redis = new URL(process.env.REDIS_URL ?? '')
  const redisDb = Number(redis.pathname.replace(/^\//, '') || '0')
  if (!Number.isInteger(redisDb) || redisDb <= 0) {
    throw new Error('REDIS_URL 必须使用大于 0 的独立 DB')
  }
  return { database, databaseName, redisDb }
}

const isolation = parseIsolation()
const childEnv = {
  ...process.env,
  NODE_ENV: mode === 'test' ? 'test' : 'development',
  VITE_API_MODE: 'http',
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: childEnv,
    stdio: 'inherit',
    ...options,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('docker', ['compose', '-f', 'apps/api/docker-compose.dev.yml', 'up', '-d', '--wait'])

const dbExists = spawnSync(
  'docker',
  ['exec', 'joinyuu-pg', 'psql', '-U', decodeURIComponent(isolation.database.username), '-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${isolation.databaseName}'`],
  { cwd: root, env: childEnv, encoding: 'utf8' },
)
if (dbExists.error || dbExists.status !== 0) process.exit(dbExists.status ?? 1)
if (dbExists.stdout.trim() !== '1') {
  run('docker', ['exec', 'joinyuu-pg', 'createdb', '-U', decodeURIComponent(isolation.database.username), isolation.databaseName])
}

run('docker', ['exec', 'joinyuu-redis', 'redis-cli', '-n', String(isolation.redisDb), 'FLUSHDB'])
run(pnpm, ['--filter', '@joinyuu/api', 'db:migrate'], { shell: useShell })
run(pnpm, ['--filter', '@joinyuu/api', 'db:seed'], { shell: useShell })

if (mode === 'test') {
  run(pnpm, ['--filter', '@joinyuu/api', 'test:e2e'], { shell: useShell })
  process.exit(0)
}

const commands = [
  ['--filter', '@joinyuu/api', 'dev'],
  ['--filter', '@joinyuu/admin', 'dev'],
  ['--filter', '@joinyuu/client-mobile', 'dev'],
]
const children = commands.map((args) =>
  spawn(pnpm, args, { cwd: root, env: childEnv, stdio: 'inherit', shell: useShell }),
)
let stopping = false
function stop(exitCode = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exit(exitCode)
}
for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping && code) stop(code)
  })
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
