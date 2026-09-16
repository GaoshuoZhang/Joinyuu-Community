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

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: corsOrigins() })
  const port = Number(process.env.PORT ?? 7757)
  await app.listen(port, '0.0.0.0')
  console.log(`[api] 聚屿社区后端已启动: http://localhost:${port}`)
}

void bootstrap()
