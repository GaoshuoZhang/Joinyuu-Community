import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { ContentsService } from './contents.service'
import { QueryArticlesDto } from './dto/query-articles.dto'
import { ArticlePayloadDto } from './dto/article-payload.dto'
import { ReviewArticleDto } from './dto/review-article.dto'
import { ColumnPayloadDto } from './dto/column-payload.dto'
import { QueryShowcaseRequestsDto } from './dto/query-showcase-requests.dto'
import { ReviewShowcaseRequestDto } from './dto/review-showcase-request.dto'

@Controller('api/admin/contents')
export class ContentsController {
  constructor(private readonly contents: ContentsService) {}

  /* ---------- 文章管理 ---------- */

  @Get('articles')
  articles(@Query() query: QueryArticlesDto) {
    return this.contents.articles(query)
  }

  @HttpCode(200)
  @Post('articles')
  createArticle(@Body() dto: ArticlePayloadDto) {
    return this.contents.createArticle(dto)
  }

  @HttpCode(200)
  @Put('articles/:id')
  updateArticle(@Param('id') id: string, @Body() dto: ArticlePayloadDto) {
    return this.contents.updateArticle(id, dto)
  }

  @HttpCode(200)
  @Post('articles/:id/submit')
  submitArticle(@Param('id') id: string) {
    return this.contents.submitArticle(id)
  }

  @HttpCode(200)
  @Post('articles/:id/review')
  reviewArticle(
    @Param('id') id: string,
    @Body() dto: ReviewArticleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contents.reviewArticle(id, dto, req.user?.name ?? '社区管理员')
  }

  @HttpCode(200)
  @Post('articles/:id/withdraw')
  withdrawArticle(@Param('id') id: string) {
    return this.contents.withdrawArticle(id)
  }

  /* ---------- 栏目管理 ---------- */

  @Get('columns')
  columns() {
    return this.contents.columns()
  }

  @HttpCode(200)
  @Post('columns')
  createColumn(@Body() dto: ColumnPayloadDto) {
    return this.contents.createColumn(dto)
  }

  @HttpCode(200)
  @Put('columns/:id')
  updateColumn(@Param('id') id: string, @Body() dto: ColumnPayloadDto) {
    return this.contents.updateColumn(id, dto)
  }

  @HttpCode(200)
  @Post('columns/:id/toggle-status')
  toggleColumnStatus(@Param('id') id: string) {
    return this.contents.toggleColumnStatus(id)
  }

  /* ---------- 展示页发布申请 ---------- */

  @Get('showcase-requests')
  showcaseRequests(@Query() query: QueryShowcaseRequestsDto) {
    return this.contents.showcaseRequests(query)
  }

  @HttpCode(200)
  @Post('showcase-requests/:id/review')
  reviewShowcaseRequest(
    @Param('id') id: string,
    @Body() dto: ReviewShowcaseRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contents.reviewShowcaseRequest(id, dto, req.user?.name ?? '社区管理员')
  }
}
