import { Module } from '@nestjs/common'
import { AppContentsController } from './contents.controller'
import { AppContentsService } from './contents.service'

/* 内容与投稿（M2-R R2 /api/app/articles、me/articles）：
 * 栏目/文章浏览、投稿（SU 前缀）、我的投稿（撤回/重提/申诉/回填）、点赞切换。
 * 评论依赖 ArticleComment 表（未建模），本 R2 跳过评论实现。 */
@Module({
  controllers: [AppContentsController],
  providers: [AppContentsService],
})
export class AppContentsModule {}