import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { ContentsService } from './contents.service'
import { QueryArticlesDto } from './dto/query-articles.dto'
import { ArticlePayloadDto } from './dto/article-payload.dto'
import { ReviewArticleDto } from './dto/review-article.dto'
import { ScheduleArticleDto } from './dto/schedule-article.dto'
import { ColumnPayloadDto } from './dto/column-payload.dto'
import { QueryShowcaseRequestsDto } from './dto/query-showcase-requests.dto'
import { ReviewShowcaseRequestDto } from './dto/review-showcase-request.dto'

@Controller('api/admin/contents')
export class ContentsController {
  constructor(private readonly contents: ContentsService) {}

  /* ---------- 文章管理 ---------- */

  /* 文章列表被资讯发布/投稿内容两页共用，两码任一即可 */
  @RequirePermission(['/contents/publish', '/contents/submissions'])
  @Get('articles')
  articles(@Query() query: QueryArticlesDto) {
    return this.contents.articles(query)
  }

  @RequirePermission('/contents/publish')
  @HttpCode(200)
  @Post('articles')
  createArticle(@Body() dto: ArticlePayloadDto) {
    return this.contents.createArticle(dto)
  }

  @RequirePermission('/contents/publish')
  @HttpCode(200)
  @Put('articles/:id')
  updateArticle(@Param('id') id: string, @Body() dto: ArticlePayloadDto) {
    return this.contents.updateArticle(id, dto)
  }

  @RequirePermission('/contents/submissions')
  @HttpCode(200)
  @Post('articles/:id/review')
  reviewArticle(
    @Param('id') id: string,
    @Body() dto: ReviewArticleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contents.reviewArticle(id, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/contents/publish')
  @HttpCode(200)
  @Post('articles/:id/publish')
  publishArticle(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.contents.publishArticle(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/contents/publish')
  @HttpCode(200)
  @Post('articles/:id/schedule')
  scheduleArticle(
    @Param('id') id: string,
    @Body() dto: ScheduleArticleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.contents.scheduleArticle(id, dto, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/contents/publish')
  @HttpCode(200)
  @Post('articles/:id/cancel-schedule')
  cancelSchedule(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.contents.cancelSchedule(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/contents/publish')
  @HttpCode(200)
  @Post('articles/:id/withdraw')
  withdrawArticle(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.contents.withdrawArticle(id, req.user?.name ?? '社区管理员')
  }

  @RequirePermission('/contents/publish')
  @HttpCode(200)
  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.contents.deleteArticle(id, req.user?.name ?? '社区管理员')
  }

  /* ---------- 栏目管理 ---------- */

  @RequirePermission('/contents/columns')
  @Get('columns')
  columns() {
    return this.contents.columns()
  }

  @RequirePermission('/contents/columns')
  @HttpCode(200)
  @Post('columns')
  createColumn(@Body() dto: ColumnPayloadDto) {
    return this.contents.createColumn(dto)
  }

  @RequirePermission('/contents/columns')
  @HttpCode(200)
  @Put('columns/:id')
  updateColumn(@Param('id') id: string, @Body() dto: ColumnPayloadDto) {
    return this.contents.updateColumn(id, dto)
  }

  @RequirePermission('/contents/columns')
  @HttpCode(200)
  @Post('columns/:id/toggle-status')
  toggleColumnStatus(@Param('id') id: string) {
    return this.contents.toggleColumnStatus(id)
  }

  @RequirePermission('/contents/columns')
  @HttpCode(200)
  @Post('columns/:id/toggle-submission')
  toggleColumnSubmission(@Param('id') id: string) {
    return this.contents.toggleColumnSubmission(id)
  }

  @RequirePermission('/contents/columns')
  @HttpCode(200)
  @Delete('columns/:id')
  deleteColumn(@Param('id') id: string) {
    return this.contents.deleteColumn(id)
  }

  /* ---------- 展示页发布申请 ---------- */

  @RequirePermission('/contents/showcase')
  @Get('showcase-requests')
  showcaseRequests(@Query() query: QueryShowcaseRequestsDto) {
    return this.contents.showcaseRequests(query)
  }

  @RequirePermission('/contents/showcase')
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
