import { Module } from '@nestjs/common'
import { AppRealnameController } from './realname.controller'
import { AppRealnameService } from './realname.service'
import { RealnameModule } from '../../../common/realname/realname.module'

/* 移动端实名模块（/api/app/me/realname*）：脱敏状态查询、提交（已联通权威二要素核验时走核验，
 * 否则按 GB 11643 规则登记）、分级权益；assertRealnameAllowed 为独立导出函数，供发布/报名模块直接调用。
 * 依赖 Prisma/Notification 为全局模块；权威核验依赖 RealnameModule。 */
@Module({
  imports: [RealnameModule],
  controllers: [AppRealnameController],
  providers: [AppRealnameService],
})
export class AppRealnameModule {}
