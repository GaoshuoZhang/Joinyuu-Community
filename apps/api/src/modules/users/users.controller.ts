import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { UsersService } from './users.service'
import { QueryUsersDto } from './dto/query-users.dto'
import { UpdateUserStatusDto } from './dto/update-user-status.dto'
import { FreezeUserDto } from './dto/freeze-user.dto'

@Controller('api/admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('options')
  options(): Promise<Array<{ label: string; value: string }>> {
    return this.users.options()
  }

  @Get()
  list(@Query() query: QueryUsersDto): Promise<{ list: unknown; total: number }> {
    return this.users.list(query)
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<unknown> {
    return this.users.detail(id)
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto): Promise<{ code: number }> {
    return this.users.updateStatus(id, dto.status)
  }

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
