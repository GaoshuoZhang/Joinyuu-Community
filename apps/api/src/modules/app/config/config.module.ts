import { Module } from '@nestjs/common'
import { ConfigController } from './config.controller'
import { ConfigService } from './config.service'

/* App 端配置与字典下发（M2-R R1，/api/app/**）：
 * 站点配置精简下发（不含管理字段）、字典单类/批量下发；与 admin 共享 Redis 缓存键。 */
@Module({
  controllers: [ConfigController],
  providers: [ConfigService],
})
export class AppConfigModule {}