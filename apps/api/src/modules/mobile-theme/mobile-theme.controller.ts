import { Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { Public } from '../../common/decorators/public.decorator'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { MobileThemeService } from './mobile-theme.service'

@Controller('api/admin/system/mobile-themes')
@RequirePermission('/system/config')
export class MobileThemeAdminController {
  constructor(private readonly themes: MobileThemeService) {}
  @Get() list() { return this.themes.list() }
  @Post('upload') @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  upload(@UploadedFile() file: { buffer: Buffer } | undefined, @Req() req: AuthenticatedRequest) { return this.themes.upload(file, req.user?.name ?? '社区管理员') }
  @Delete(':id') @HttpCode(200)
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.themes.remove(id, req.user?.name ?? '社区管理员') }
  @Post('reset') @HttpCode(200)
  reset(@Req() req: AuthenticatedRequest) { return this.themes.change('reset', undefined, req.user?.name ?? '社区管理员') }
  @Post('rollback') @HttpCode(200)
  rollback(@Req() req: AuthenticatedRequest) { return this.themes.change('rollback', undefined, req.user?.name ?? '社区管理员') }
  @Post(':id/activate') @HttpCode(200)
  activate(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.themes.change('activate', id, req.user?.name ?? '社区管理员') }
  @Post(':id/preview') @HttpCode(200)
  preview(@Param('id') id: string) { return this.themes.preview(id) }
}

@Controller('api/app/mobile-theme')
export class MobileThemeAppController {
  constructor(private readonly themes: MobileThemeService) {}
  @Public() @Get()
  async current(@Query('preview') preview?: string, @Res({ passthrough: true }) res?: Response) {
    res?.setHeader('Cache-Control', 'no-store')
    return this.themes.current(preview)
  }
}

@Controller('api/public/mobile-themes')
export class MobileThemeAssetsController {
  constructor(private readonly themes: MobileThemeService) {}
  @Public() @Get(':id/*path')
  async asset(@Param('id') id: string, @Param('path') path: string | string[], @Res() res: Response) {
    const file = await this.themes.asset(id, Array.isArray(path) ? path.join('/') : path)
    res.setHeader('Content-Type', file.mime)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(file.buffer)
  }
}
