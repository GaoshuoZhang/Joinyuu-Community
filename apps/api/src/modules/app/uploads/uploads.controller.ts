import { Body, Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { AppUploadsService, type AppUploadResult, type AppUploadedFile } from './uploads.service'

@Controller('api/app')
export class AppUploadsController {
  constructor(private readonly uploads: AppUploadsService) {}

  /** 申请资料/配图上传（multipart 字段 file + bizType；登录即可，无权限要求） */
  @Post('uploads')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  upload(@UploadedFile() file: AppUploadedFile, @Body('bizType') _bizType?: string): Promise<AppUploadResult> {
    return this.uploads.upload(file)
  }
}