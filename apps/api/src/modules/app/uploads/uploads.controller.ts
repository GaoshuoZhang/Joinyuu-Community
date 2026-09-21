import { Body, Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  AppUploadsService,
  MAX_UPLOAD_FILE_BYTES,
  type AppUploadResult,
  type AppUploadedFile,
} from './uploads.service'
import { AppUploadRateLimitInterceptor } from './upload-rate-limit.interceptor'

@Controller('api/app')
export class AppUploadsController {
  constructor(private readonly uploads: AppUploadsService) {}

  /** 申请资料/配图上传（multipart 字段 file + bizType；登录即可，无权限要求）。
   * 频控拦截器排在 FileInterceptor 之前，超频请求在 multer 内存缓冲前即被拒。 */
  @Post('uploads')
  @HttpCode(200)
  @UseInterceptors(
    AppUploadRateLimitInterceptor,
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_FILE_BYTES } }),
  )
  upload(@UploadedFile() file: AppUploadedFile, @Body('bizType') _bizType?: string): Promise<AppUploadResult> {
    return this.uploads.upload(file)
  }
}