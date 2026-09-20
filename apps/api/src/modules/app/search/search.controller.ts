import { Controller, Get, Query } from '@nestjs/common'
import { PageQueryDto } from '../../../common/dto/page-query.dto'
import { AppSearchService, type SearchResultDto } from './search.service'

@Controller('api/app')
export class AppSearchController {
  constructor(private readonly searchService: AppSearchService) {}

  /** 全域聚合搜索：keyword + 可选类型过滤 + 分类计数 + 分页 */
  @Get('search')
  searchQuery(
    @Query() query: PageQueryDto,
    @Query('keyword') keyword?: string,
    @Query('type') type?: string,
  ): Promise<SearchResultDto> {
    return this.searchService.search(keyword ?? '', type, query.page, query.pageSize)
  }
}