import { Module } from '@nestjs/common'
import { LoginLogsController } from './login-logs.controller'
import { LoginLogService } from './login-log.service'

/* 登录日志：AuthService 写入 + 查询端点 */
@Module({
  controllers: [LoginLogsController],
  providers: [LoginLogService],
  exports: [LoginLogService],
})
export class LoginLogsModule {}
