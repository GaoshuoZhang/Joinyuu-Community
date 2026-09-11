import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common'
import type { Response } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { AssetsService } from './assets.service'

/* 素材公开读取：<img src> 无法携带 Authorization，故走公开路由（仅按存储键读取已入库素材） */
@Controller('api/public/files')
export class FilesController {
  constructor(private readonly assets: AssetsService) {}

  @Public()
  @Get(':key')
  async serve(@Param('key') key: string, @Res() res: Response): Promise<void> {
    const file = await this.assets.readFile(key)
    if (!file) throw new NotFoundException('文件不存在')
    res.setHeader('Content-Type', file.mime)
    /* H4 加固：禁止 MIME 嗅探、显式内联下载名，防同源脚本执行 */
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
    /* 素材可能被「替换」（同键覆盖），用 no-cache + ETag 协商：未变 304、替换后立即拿到新图 */
    res.setHeader('Cache-Control', 'no-cache')
    res.send(file.buffer)
  }
}
