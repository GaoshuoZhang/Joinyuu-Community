import { apiMode, httpUpload } from './http'
import type { UploadedFileInfo } from '@/types'
import * as mock from '@/mock/handlers/uploads'

/** POST /api/app/uploads — 上传申请资料（图片/PDF，复用服务端存储管线）。 */
export async function uploadFile(file: File, bizType = 'application'): Promise<UploadedFileInfo> {
  if (apiMode === 'mock') return mock.uploadFile(file)
  const form = new FormData()
  form.append('file', file)
  form.append('bizType', bizType)
  return httpUpload<UploadedFileInfo>('/uploads', form)
}
