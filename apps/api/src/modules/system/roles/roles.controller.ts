import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UnauthorizedException } from '@nestjs/common'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request'
import { RolesService, type AdminRoleDto, type PermissionGroupDto } from './roles.service'
import { CreateRoleDto } from './dto/create-role.dto'
import { SaveRolePermissionsDto } from './dto/save-role-permissions.dto'
import { SaveRoleScopeDto } from './dto/save-role-scope.dto'
import { SaveRoleAssignmentDto } from './dto/save-role-assignment.dto'

@Controller('api/admin')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('roles')
  @RequirePermission('/system/roles')
  list(): Promise<AdminRoleDto[]> {
    return this.roles.list()
  }

  @Post('roles')
  @HttpCode(200)
  @RequirePermission('/system/roles')
  create(@Body() dto: CreateRoleDto, @Req() req: AuthenticatedRequest): Promise<AdminRoleDto> {
    const user = req.user
    if (!user) throw new UnauthorizedException('未登录或登录已过期')
    return this.roles.create(dto, { username: user.sub, name: user.name })
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

  @Put('roles/:id/scope')
  @HttpCode(200)
  @RequirePermission('/system/roles')
  saveScope(
    @Param('id') id: string,
    @Body() dto: SaveRoleScopeDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    const user = req.user
    if (!user) throw new UnauthorizedException('未登录或登录已过期')
    return this.roles.saveScope(id, dto.dataScope, { username: user.sub, name: user.name })
  }

  @Put('roles/:id/assignment')
  @HttpCode(200)
  @RequirePermission('/system/roles')
  saveAssignment(
    @Param('id') id: string,
    @Body() dto: SaveRoleAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    const user = req.user
    if (!user) throw new UnauthorizedException('未登录或登录已过期')
    return this.roles.saveAssignment(id, dto.permCodes, dto.dataScope, { username: user.sub, name: user.name })
  }

  @Get('permissions/catalog')
  @RequirePermission('/system/roles')
  catalog(): Promise<PermissionGroupDto[]> {
    return this.roles.catalog()
  }
}
