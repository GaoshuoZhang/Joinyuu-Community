import { Module } from '@nestjs/common'
import { TrashController } from './trash.controller'
import { TrashService } from './trash.service'

/* 归档管理：软删除对象集中管理（归档设置 + 恢复/彻底删除 + 自动归档/自动删除入口） */
@Module({
  controllers: [TrashController],
  providers: [TrashService],
  exports: [TrashService],
})
export class TrashModule {}
