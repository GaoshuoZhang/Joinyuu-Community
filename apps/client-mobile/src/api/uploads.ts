import { ApiError, apiMode, httpUpload } from './http'
import type { UploadedFileInfo } from '@/types'

/** 上传规则（与 mock/handlers/uploads 同口径）：类型白名单 + 大小上限 + 用途白名单。 */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
const MAX_SIZE_MB = 10
const ALLOWED_BIZ_TYPES = ['application', 'avatar', 'enterprise-logo', 'article', 'milestone']

/** 上传前置校验：http 与 mock 走同一校验函数，避免 http 分支零校验。 */
export function validateUpload(file: File, bizType: string): void {
  if (!ALLOWED_BIZ_TYPES.includes(bizType)) throw new ApiError(400, '上传用途不合法')
  if (!ALLOWED_TYPES.includes(file.type)) throw new ApiError(400, '仅支持 JPG/PNG/GIF/WebP 图片或 PDF 文件')
  if (file.size > MAX_SIZE_MB * 1024 * 1024) throw new ApiError(400, `文件大小不能超过 ${MAX_SIZE_MB}MB`)
}

/** POST /api/app/uploads — 上传申请资料（图片/PDF，复用服务端存储管线）。 */
export async function uploadFile(file: File, bizType = 'application'): Promise<UploadedFileInfo> {
  validateUpload(file, bizType)
  if (apiMode === 'mock') return (await import('@/mock/handlers/uploads')).uploadFile(file)
  const form = new FormData()
  form.append('file', file)
  form.append('bizType', bizType)
  return httpUpload<UploadedFileInfo>('/uploads', form)
}
