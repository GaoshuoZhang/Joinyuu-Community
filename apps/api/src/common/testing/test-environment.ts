export function assertSafeTestEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error('拒绝重种子：NODE_ENV 必须为 test')
  }

  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('拒绝重种子：缺少 DATABASE_URL')

  let databaseName = ''
  try {
    const parsed = new URL(databaseUrl)
    databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  } catch {
    throw new Error('拒绝重种子：DATABASE_URL 格式无效')
  }
  if (!/_(?:it|test)$/.test(databaseName)) {
    throw new Error(`拒绝重种子：数据库 ${databaseName || '(空)'} 不是隔离测试库（名称必须以 _it 或 _test 结尾）`)
  }

  const redisUrl = env.REDIS_URL
  if (!redisUrl) throw new Error('拒绝重种子：缺少 REDIS_URL')

  let redisDb = 0
  try {
    const parsed = new URL(redisUrl)
    redisDb = Number(parsed.pathname.replace(/^\//, '') || '0')
  } catch {
    throw new Error('拒绝重种子：REDIS_URL 格式无效')
  }
  if (!Number.isInteger(redisDb) || redisDb <= 0) {
    throw new Error('拒绝重种子：Redis 必须使用大于 0 的独立 DB')
  }
}
