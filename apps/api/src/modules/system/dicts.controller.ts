import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { DictsService } from './dicts.service'
import { DictEntryPayloadDto } from './dto/dict-entry-payload.dto'

@RequirePermission('/system/dicts')
@Controller('api/admin/dicts')
export class DictsController {
  constructor(private readonly dicts: DictsService) {}

  @Get(':type')
  findAll(@Param('type') type: string) {
    return this.dicts.findAll(type)
  }

  @HttpCode(200)
  @Post(':type')
  create(@Param('type') type: string, @Body() dto: DictEntryPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.dicts.create(type, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post(':type/:code/toggle-status')
  toggle(@Param('type') type: string, @Param('code') code: string, @Req() req: AuthenticatedRequest) {
    return this.dicts.toggle(type, code, req.user?.name ?? '社区管理员')
  }

  @Delete(':type/:code')
  remove(@Param('type') type: string, @Param('code') code: string, @Req() req: AuthenticatedRequest) {
    return this.dicts.remove(type, code, req.user?.name ?? '社区管理员')
  }
}
