import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { DictsService } from './dicts.service'
import { DictEntryPayloadDto, UpdateDictEntryDto } from './dto/dict-entry-payload.dto'

/* 字典项为跨域共享的只读选项（需求/活动/商城/用户等表单筛选均取用）：
 * GET 对全部登录员工开放；增删改仍要求 /system/dicts 权限。
 * 商品类别（goods_category）的维护入口在「积分商城 > 商品管理」页的「商品类别」弹窗（含类别级范围）。 */
@Controller('api/admin/dicts')
export class DictsController {
  constructor(private readonly dicts: DictsService) {}

  @Get(':type')
  findAll(@Param('type') type: string) {
    return this.dicts.findAll(type)
  }

  @RequirePermission('/system/dicts')
  @HttpCode(200)
  @Post(':type')
  create(@Param('type') type: string, @Body() dto: DictEntryPayloadDto, @Req() req: AuthenticatedRequest) {
    return this.dicts.create(type, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/system/dicts')
  @HttpCode(200)
  @Put(':type/:code')
  update(@Param('type') type: string, @Param('code') code: string, @Body() dto: UpdateDictEntryDto, @Req() req: AuthenticatedRequest) {
    return this.dicts.update(type, code, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/system/dicts')
  @HttpCode(200)
  @Post(':type/:code/toggle-status')
  toggle(@Param('type') type: string, @Param('code') code: string, @Req() req: AuthenticatedRequest) {
    return this.dicts.toggle(type, code, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/system/dicts')
  @Delete(':type/:code')
  remove(@Param('type') type: string, @Param('code') code: string, @Req() req: AuthenticatedRequest) {
    return this.dicts.remove(type, code, req.user?.name ?? '社区管理员')
  }
}
