import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { UsersService } from './users.service'
import { QueryUsersDto } from './dto/query-users.dto'
import { UpdateUserStatusDto } from './dto/update-user-status.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { FreezeUserDto } from './dto/freeze-user.dto'

@Controller('api/admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /* 选项端点供跨域表单复用，仅需登录（只返回 uid+nickname） */
  @Get('options')
  options(): Promise<Array<{ label: string; value: string }>> {
    return this.users.options()
  }

  @RequirePermission('/users')
  @Get()
  list(@Query() query: QueryUsersDto): Promise<{ list: unknown; total: number }> {
    return this.users.list(query)
  }

  @RequirePermission('/users')
  @Get(':id')
  detail(@Param('id') id: string): Promise<unknown> {
    return this.users.detail(id)
  }

  /* 用户记录聚合（详情页记录标签页）：7 域记录一次性返回 */
  @RequirePermission('/users')
  @Get(':id/records')
  records(@Param('id') id: string): Promise<Record<string, unknown[]>> {
    return this.users.records(id)
  }

  @RequirePermission('/users')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.users.update(id, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/users')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto): Promise<{ code: number }> {
    return this.users.updateStatus(id, dto.status)
  }

  @RequirePermission('/users')
  @HttpCode(200)
  @Post(':id/freeze')
  freeze(
    @Param('id') id: string,
    @Body() dto: FreezeUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.users.freeze(id, dto, req.user?.name ?? '社区管理员')
  }
}
