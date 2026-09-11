import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import { ExportService } from './export.service'
import { QueryExportDto } from './dto/query-export.dto'

/* 数据导出：GET /api/admin/export/:domain → CSV 附件流（UTF-8 BOM） */
@RequirePermission('/system/export')
@Controller('api/admin/export')
export class ExportController {
  constructor(private readonly exporter: ExportService) {}

  @Get(':domain')
  async export(
    @Param('domain') domain: string,
    @Query() query: QueryExportDto,
    @Res() res: Response,
  ): Promise<void> {
    const { fileName, content } = await this.exporter.exportCsv(domain, query)
    const encodedName = encodeURIComponent(fileName)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`)
    res.send('\uFEFF' + content)
  }
}
