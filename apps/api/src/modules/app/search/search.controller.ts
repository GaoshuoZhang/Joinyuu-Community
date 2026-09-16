import { Controller, Get, Query } from '@nestjs/common'
import { AppSearchService, type SearchResultDto } from './search.service'

@Controller('api/app')
export class AppSearchController {
  constructor(private readonly searchService: AppSearchService) {}

  /** 全域聚合搜索：keyword + 可选类型过滤 + 分类计数 + 分页 */
  @Get('search')
  searchQuery(
    @Query('keyword') keyword?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<SearchResultDto> {
    return this.searchService.search(
      keyword ?? '',
      type,
      Number.parseInt(page ?? '1', 10) || 1,
      Number.parseInt(pageSize ?? '10', 10) || 10,
    )
  }
}