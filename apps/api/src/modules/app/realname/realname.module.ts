import { Module } from '@nestjs/common'
import { AppRealnameController } from './realname.controller'
import { AppRealnameService } from './realname.service'

/* 移动端实名认证模块（/api/app/me/realname*）：脱敏状态查询、提交认证（GB 11643 校验码）、
 * 分级权益；assertRealnameAllowed 为独立导出函数，供发布/报名模块直接调用。
 * 依赖均为全局模块（Prisma/Notification），无需额外 imports。 */
@Module({
  controllers: [AppRealnameController],
  providers: [AppRealnameService],
})
export class AppRealnameModule {}
