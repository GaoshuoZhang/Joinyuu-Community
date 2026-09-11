import { Global, Module } from '@nestjs/common'
import { AdminPermissionService } from './admin-permission.service'

/* RBAC 公共模块：权限装载服务全局可用（AuthService 登录装载 + PermissionGuard 校验） */
@Global()
@Module({
  providers: [AdminPermissionService],
  exports: [AdminPermissionService],
})
export class RbacModule {}
