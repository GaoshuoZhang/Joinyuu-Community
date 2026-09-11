import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { AssetsService, type MallAssetDto, type UploadedFileLike } from './assets.service'
import { QueryAssetsDto } from './dto/query-assets.dto'

@Controller('api/admin/assets')
@RequirePermission('/system/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(@Query() query: QueryAssetsDto): Promise<MallAssetDto[]> {
    return this.assets.list(query.bizType)
  }

  /** 上传素材（multipart，字段名 file；bizType 可选）。
   * multer 硬上限 100MB 兜底（系统配置上限 ≤100），实际限制在服务层按系统配置校验并返回中文提示 */
  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  upload(
    @UploadedFile() file: UploadedFileLike,
    @Body('bizType') bizType: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<MallAssetDto> {
    return this.assets.upload(file, bizType, req.user?.name ?? '社区管理员')
  }

  /** 替换素材（multipart，字段名 file）：覆盖原存储键，引用方 URL 不变、内容即时生效 */
  @Post(':id/replace')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  replace(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike,
    @Req() req: AuthenticatedRequest,
  ): Promise<MallAssetDto> {
    return this.assets.replace(id, file, req.user?.name ?? '社区管理员')
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ code: number }> {
    return this.assets.remove(id, req.user?.name ?? '社区管理员')
  }
}
