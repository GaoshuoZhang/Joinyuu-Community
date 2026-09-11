import { Global, Module } from '@nestjs/common'
import { StorageService } from './storage.service'

/* 对象存储：全局可注入，业务上传与素材库共用 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
