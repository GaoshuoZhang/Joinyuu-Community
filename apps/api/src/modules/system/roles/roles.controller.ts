import { Body, Controller, Get, HttpCode, Param, Put, Req, UnauthorizedException } from '@nestjs/common'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request'
import { RolesService, type AdminRoleDto, type PermissionGroupDto } from './roles.service'
import { SaveRolePermissionsDto } from './dto/save-role-permissions.dto'

@Controller('api/admin')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermission('/system/roles')
  list(): Promise<AdminRoleDto[]> {
    return this.roles.list()
  }

  @Put('roles/:id/permissions')
  @HttpCode(200)
  @RequirePermission('/system/roles')
  savePermissions(
    @Param('id') id: string,
    @Body() dto: SaveRolePermissionsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    const user = req.user
    if (!user) throw new UnauthorizedException('未登录或登录已过期')
    return this.roles.savePermissions(id, dto.permCodes, { username: user.sub, name: user.name })
  }

  @Get('permissions/catalog')
  @RequirePermission('/system/roles')
  catalog(): Promise<PermissionGroupDto[]> {
    return this.roles.catalog()
  }
}
