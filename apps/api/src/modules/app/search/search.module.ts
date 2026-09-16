import { Module } from '@nestjs/common'
import { AppSearchController } from './search.controller'
import { AppSearchService } from './search.service'

/* 全域聚合搜索（M2-R R2 GET /api/app/search）：6 域计数 + 当前域分页结果 */
@Module({
  controllers: [AppSearchController],
  providers: [AppSearchService],
})
export class AppSearchModule {}