import { Controller, Get, Query, Req } from '@nestjs/common'
import { PageQueryDto } from '../../../common/dto/page-query.dto'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppSearchService, type SearchResultDto } from './search.service'

@Controller('api/app')
export class AppSearchController {
  constructor(private readonly searchService: AppSearchService) {}

  /** 全域聚合搜索：keyword + 可选类型过滤 + 分类计数 + 分页（需求/活动按当前用户可见范围过滤） */
  @Get('search')
  searchQuery(
    @Req() req: AppAuthenticatedRequest,
    @Query() query: PageQueryDto,
    @Query('keyword') keyword?: string,
    @Query('type') type?: string,
  ): Promise<SearchResultDto> {
    return this.searchService.search(req.user?.sub, keyword ?? '', type, query.page, query.pageSize)
  }
}