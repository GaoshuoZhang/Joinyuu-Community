import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common'
import type { AppAuthenticatedRequest } from '../../../common/interfaces/app-authenticated-request'
import { AppContentsService, type ArticleColumnDto, type ArticleDto, type ArticlePayloadDto, type MySubmittedArticleDetailDto, type MySubmittedArticleDto } from './contents.service'
import { CreateArticleDto } from './dto/create-article.dto'
import { CreateCommentDto } from './dto/create-comment.dto'
import { Public } from '../../../common/decorators/public.decorator'

@Controller('api/app')
export class AppContentsController {
  constructor(private readonly contents: AppContentsService) {}

  /** 栏目列表（enabled） */
  @Public()
  @Get('article-columns')
  columns(): Promise<ArticleColumnDto[]> {
    return this.contents.articleColumns()
  }

  /** 文章列表（published，栏目/关键词；客户端传 column=栏目 id，兼容 columnId） */
  @Public()
  @Get('articles')
  list(@Query('column') column?: string, @Query('columnId') columnId?: string, @Query('keyword') keyword?: string): Promise<ArticleDto[]> {
    return this.contents.articles(column || columnId, keyword)
  }

  /** 文章详情（浏览量 +1） */
  @Public()
  @Get('articles/:id')
  detail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<ArticleDto> {
    return this.contents.articleDetail(id, req.headers.authorization)
  }

  /** 投递文章（SU 前缀，提交即待审核） */
  @HttpCode(200)
  @Post('articles')
  create(@Req() req: AppAuthenticatedRequest, @Body() dto: CreateArticleDto): Promise<{ id: string }> {
    return this.contents.createArticle(this.user(req), dto)
  }

  /** 我的投稿 */
  @Get('me/articles')
  myArticles(@Req() req: AppAuthenticatedRequest): Promise<MySubmittedArticleDto[]> {
    return this.contents.myArticles(this.user(req).uid)
  }

  /** 我的投稿详情（全状态，仅作者本人） */
  @Get('me/articles/:id')
  myArticleDetail(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<MySubmittedArticleDetailDto> {
    return this.contents.myArticleDetail(this.user(req).uid, id)
  }

  /** 撤回审核中的投稿 */
  @HttpCode(200)
  @Post('me/articles/:id/withdraw')
  withdraw(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<{ code: number }> {
    return this.contents.withdrawArticle(this.user(req).uid, id)
  }

  /** 修改重提 */
  @HttpCode(200)
  @Post('me/articles/:id/resubmit')
  resubmit(@Req() req: AppAuthenticatedRequest, @Param('id') id: string, @Body() dto: CreateArticleDto): Promise<{ code: number }> {
    return this.contents.resubmitArticle(this.user(req).uid, id, dto)
  }

  /** 修改重提的回填载荷 */
  @Get('me/articles/:id/payload')
  payload(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<ArticlePayloadDto> {
    return this.contents.articlePayload(this.user(req).uid, id)
  }

  /** 点赞切换 */
  @HttpCode(200)
  @Post('articles/:id/likes/toggle')
  toggleLike(@Req() req: AppAuthenticatedRequest, @Param('id') id: string): Promise<{ liked: boolean; likeCount: number }> {
    return this.contents.toggleLike(this.user(req).uid, id)
  }

  @Public()
  @Get('articles/:id/comments')
  comments(@Param('id') id: string) {
    return this.contents.articleComments(id)
  }

  @HttpCode(200)
  @Post('articles/:id/comments')
  createComment(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.contents.createArticleComment(this.user(req).uid, id, dto.content, dto)
  }

  /** 删除自己的评论 */
  @HttpCode(200)
  @Delete('articles/:id/comments/:commentId')
  deleteComment(
    @Req() req: AppAuthenticatedRequest,
    @Param('id') id: string,
    @Param('commentId') commentId: string,
  ) {
    return this.contents.deleteMyArticleComment(this.user(req).uid, id, commentId)
  }

  private user(req: AppAuthenticatedRequest): { uid: string; name: string } {
    const payload = req.user
    if (!payload) throw new UnauthorizedException('未登录或登录已过期')
    return { uid: payload.sub, name: payload.name }
  }

}
