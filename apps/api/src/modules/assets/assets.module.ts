import { Module } from '@nestjs/common'
import { AssetsController } from './assets.controller'
import { FilesController } from './files.controller'
import { AssetsService } from './assets.service'

/* 素材库：管理端上传/列表/删除 + 公开文件读取 */
@Module({
  controllers: [AssetsController, FilesController],
  providers: [AssetsService],
})
export class AssetsModule {}
