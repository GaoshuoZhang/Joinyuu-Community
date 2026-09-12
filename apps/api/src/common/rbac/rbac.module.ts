import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { AdminPermissionService } from './admin-permission.service'
import { PermissionCatalogValidatorService } from './permission-catalog-validator.service'

/* RBAC 公共模块：权限装载服务全局可用（AuthService 登录装载 + PermissionGuard 校验）。
 * DiscoveryModule 提供 DiscoveryService/MetadataScanner，供启动期权限码目录校验。 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [AdminPermissionService, PermissionCatalogValidatorService],
  exports: [AdminPermissionService],
})
export class RbacModule {}
