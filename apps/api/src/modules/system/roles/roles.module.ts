import { Module } from '@nestjs/common'
import { RolesController } from './roles.controller'
import { RolesService } from './roles.service'

/* RBAC 角色与权限 */
@Module({
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
