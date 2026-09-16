import { Module } from '@nestjs/common'
import { AppUploadsController } from './uploads.controller'
import { AppUploadsService } from './uploads.service'

/* App 上传（M2-R R2 POST /api/app/uploads）：图片/PDF（魔数嗅探）、大小上限读系统配置。
 * 复用 Storage（全局）写盘，不落 MallAsset 素材库。 */
@Module({
  controllers: [AppUploadsController],
  providers: [AppUploadsService],
})
export class AppUploadsModule {}