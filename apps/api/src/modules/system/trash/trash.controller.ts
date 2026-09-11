import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request'
import { TrashService, type ArchiveSettingDto, type ArchiveItemDto } from './trash.service'
import { QueryTrashDto } from './dto/query-trash.dto'
import { UpdateArchiveSettingDto } from './dto/update-archive-setting.dto'

@Controller('api/admin/trash')
@RequirePermission('/system/trash')
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  /** 已归档列表（按业务域标签页筛选） */
  @Get()
  list(@Query() query: QueryTrashDto): Promise<{ list: ArchiveItemDto[]; total: number }> {
    return this.trash.list(query)
  }

  /** 归档设置（各标签页独立配置） */
  @Get('settings')
  listSettings(): Promise<ArchiveSettingDto[]> {
    return this.trash.listSettings()
  }

  /** 更新某标签页的归档设置 */
  @Put('settings/:domain')
  updateSettings(
    @Param('domain') domain: string,
    @Body() dto: UpdateArchiveSettingDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ArchiveSettingDto> {
    return this.trash.updateSettings(domain, dto, req.user?.name ?? '社区管理员')
  }

  /** 恢复对象（清空软删除标记） */
  @Post(':domain/:id/restore')
  @HttpCode(200)
  restore(
    @Param('domain') domain: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.trash.restore(domain, id, req.user?.name ?? '社区管理员')
  }

  /** 彻底删除（物理删 + 审计） */
  @Post(':domain/:id/purge')
  @HttpCode(200)
  purge(
    @Param('domain') domain: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ code: number }> {
    return this.trash.purge(domain, id, req.user?.name ?? '社区管理员')
  }
}
