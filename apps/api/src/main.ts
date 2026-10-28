import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/* CORS：默认仅放行本机管理端（Vite 7758）。管理端开发走 Vite 代理为同源，通常无需额外配置；
 * 如需局域网/多域名浏览器直连 API，用 CORS_ORIGINS（逗号分隔）覆盖 */
function corsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (raw && raw.length) return raw
  return [
    'http://localhost:7758',
    'http://127.0.0.1:7758',
    'http://localhost:7759',
    'http://127.0.0.1:7759',
  ]
}

/* 反向代理信任设置：Express 默认不信任代理，导致 req.ip 取到代理地址而非客户端真实 IP。
 * 审计（AuditContextMiddleware 取 req.ip 供 AuditService.record 落库）与登录/验证码/短信/邮箱限流
 * （auth/email-code/sms-code）都依赖 req.ip，
 * 置为 0/false 可关闭；默认信任一层代理。 */
function trustProxySetting(raw?: string): boolean | number {
  if (raw === undefined) return 1
  if (raw === '0' || raw === 'false') return false
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : true
}

/* 全站时间字符串约定 Asia/Shanghai（UTC+8）：formatNow/formatToday/scheduler Cron 均按进程本地时区。
 * BE-M11 启动校验：进程时区与约定不符时显著告警，提示部署侧设置 TZ=Asia/Shanghai。 */
function assertTimezone(): void {
  const tz = process.env.TZ
  const offsetMinutes = -new Date().getTimezoneOffset()
  const offsetText = `${offsetMinutes >= 0 ? '+' : '-'}${Math.abs(offsetMinutes) / 60}h`
  if (tz && tz !== 'Asia/Shanghai') {
    console.warn(`[time] 检测到 TZ=${tz}，与约定 Asia/Shanghai 不符：全站时间字符串将偏移 ${offsetText}`)
  } else if (!tz && offsetMinutes !== 480) {
    console.warn(`[time] 进程时区未设置且当前偏移 ${offsetText}（非 +8h）：全站时间将偏移，请在部署环境设置 TZ=Asia/Shanghai`)
  }
}

async function bootstrap(): Promise<void> {
  assertTimezone()
  const app = await NestFactory.create(AppModule, { rawBody: true })
  /* Express 实例设置信任代理（INestApplication 未暴露 set，经 http adapter 获取底层实例） */
  ;(app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set(
    'trust proxy',
    trustProxySetting(process.env.TRUST_PROXY),
  )
  app.enableCors({ origin: corsOrigins() })
  const port = Number(process.env.PORT ?? 7757)
  await app.listen(port, '0.0.0.0')
  console.log(`[api] 聚屿社区后端已启动: http://localhost:${port}`)
}

void bootstrap().catch((error) => {
  /* 启动失败显式退出并透出错误，避免静默挂起/半启动 */
  console.error('[api] 启动失败:', error instanceof Error ? error.message : error)
  process.exit(1)
})
