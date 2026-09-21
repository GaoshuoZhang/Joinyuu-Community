import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { RequirePermission } from '../../../common/decorators/require-permission.decorator'
import type { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request'
import { ExportService } from './export.service'
import { QueryExportDto } from './dto/query-export.dto'

/* 数据导出：GET /api/admin/export/:domain → CSV 附件流（UTF-8 BOM）；每次导出写操作审计 */
@RequirePermission('/system/export')
@Controller('api/admin/export')
export class ExportController {
  constructor(private readonly exporter: ExportService) {}

  @Get(':domain')
  async export(
    @Param('domain') domain: string,
    @Query() query: QueryExportDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { fileName, content, truncated, rowCount } = await this.exporter.exportCsv(
      domain,
      query,
      req.user?.name ?? '社区管理员',
    )
    const encodedName = encodeURIComponent(fileName)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`)
    /* 截断与行数透出给前端，便于提示「已达单次导出上限」 */
    res.setHeader('X-Export-Truncated', truncated ? '1' : '0')
    res.setHeader('X-Export-Rows', String(rowCount))
    res.setHeader('Access-Control-Expose-Headers', 'X-Export-Truncated, X-Export-Rows')
    res.send('\uFEFF' + content)
  }
}
