import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UnauthorizedException } from '@nestjs/common'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request'
import { AdminsService, type AdminAccountDto } from './admins.service'
import { CreateAdminDto } from './dto/create-admin.dto'
import { UpdateAdminDto } from './dto/update-admin.dto'
import { UpdateAdminStatusDto } from './dto/update-admin-status.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'

@Controller('api/admin/admins')
@RequirePermission('/system/admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get('role-options')
  roleOptions() {
    return this.admins.roleOptions()
  }

  @Get()
  list(@Query('keyword') keyword?: string): Promise<{ list: AdminAccountDto[]; total: number }> {
    return this.admins.list(keyword)
  }

  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateAdminDto, @Req() req: AuthenticatedRequest): Promise<{ id: number; initialPassword?: string }> {
    const user = this.operator(req)
    return this.admins.create(dto, user)
  }

  @Put(':id')
  @HttpCode(200)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.admins.update(id, dto, this.operator(req))
  }

  @Patch(':id/status')
  @HttpCode(200)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdminStatusDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.admins.updateStatus(id, dto.status, this.operator(req))
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.admins.resetPassword(id, dto, this.operator(req))
  }

  /** 取当前登录管理员标识（sub 用于防提权判定，name 用于审计展示） */
  private operator(req: AuthenticatedRequest): { username: string; name: string } {
    const user = req.user
    if (!user) throw new UnauthorizedException('未登录或登录已过期')
    return { username: user.sub, name: user.name }
  }
}
