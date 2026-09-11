import { Module } from '@nestjs/common'
import { AdminsController } from './admins.controller'
import { AdminsService } from './admins.service'

/* 管理员账号 */
@Module({
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
