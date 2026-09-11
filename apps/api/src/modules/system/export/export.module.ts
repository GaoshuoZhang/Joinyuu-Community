import { Module } from '@nestjs/common'
import { ExportController } from './export.controller'
import { ExportService } from './export.service'

/* 数据导出：CSV 服务端导出 */
@Module({
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
