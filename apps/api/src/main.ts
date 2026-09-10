import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableCors()
  const port = Number(process.env.PORT ?? 7757)
  await app.listen(port, '0.0.0.0')
  console.log(`[api] 聚屿社区后端已启动: http://localhost:${port}`)
}

void bootstrap()
