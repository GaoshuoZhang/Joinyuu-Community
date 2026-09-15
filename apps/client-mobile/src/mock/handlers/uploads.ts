import type { UploadedFileInfo } from '@/types'
import { fail } from '@/mock/latency'

/* [MOCK-ONLY] app 上传（图片/PDF）：内存读取为 data URL 供预览；接入期对接 POST /api/app/uploads（缺口 §7.1-6）。 */

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
const MAX_SIZE_MB = 10

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('文件读取失败，请重试'))
    reader.readAsDataURL(file)
  })
}

export async function uploadFile(file: File): Promise<UploadedFileInfo> {
  await new Promise((r) => setTimeout(r, 260))
  if (!ALLOWED_TYPES.includes(file.type)) fail(400, '仅支持 JPG/PNG/GIF/WebP 图片或 PDF 文件')
  if (file.size > MAX_SIZE_MB * 1024 * 1024) fail(400, `文件大小不能超过 ${MAX_SIZE_MB}MB`)
  const url = await readAsDataURL(file)
  return {
    key: `AST${Date.now()}${Math.floor(Math.random() * 90 + 10)}`,
    name: file.name,
    size: file.size,
    type: file.type,
    url,
  }
}
