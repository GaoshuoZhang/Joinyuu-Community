import { BadRequestException, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../../common/prisma/prisma.service'
import { StorageService } from '../../../common/storage/storage.service'

/** multipart 上传文件的最小字段集 */
export interface AppUploadedFile {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

/** App 上传结果（对齐客户端 UploadedFileInfo：key/name/size/type/url） */
export interface AppUploadResult {
  key: string
  name: string
  size: number
  type: string
  url: string
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/* App 上传（M2-R R2 POST /api/app/uploads）：申请资料/配图上传，仅图片与 PDF（魔数嗅探，SVG 拒绝），
 * 大小上限读 SystemConfig.uploadMaxSizeMb（缺省 10）；复用 Storage 写盘并返回 {key,name,size,type,url}
 * （url=/api/public/files/:key）。R2 不落 MallAsset 素材库，保持与 admin 资产隔离。 */
@Injectable()
export class AppUploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(file: AppUploadedFile | undefined): Promise<AppUploadResult> {
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('请选择要上传的文件')
    const limitMb = await this.uploadLimitMb()
    if (file.size > limitMb * 1024 * 1024) throw new BadRequestException(`文件大小不能超过 ${limitMb} MB`)
    const mime = sniffMime(file.buffer)
    if (!mime || !ALLOWED_MIME.has(mime)) throw new BadRequestException('不支持的文件类型，仅支持 JPG/PNG/GIF/WebP 图片或 PDF')

    const key = `${randomUUID()}${MIME_EXT[mime]}`
    await this.storage.put(key, file.buffer, mime)
    return {
      key,
      name: decodeFileName(file.originalname),
      size: file.size,
      type: mime,
      url: this.storage.url(key),
    }
  }

  /** 上传大小限制（MB）：读取系统配置，缺省 10 */
  private async uploadLimitMb(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    return config?.uploadMaxSizeMb ?? 10
  }
}

/** 魔数嗅探：以文件内容判定真实类型，不信任客户端 mimetype（SVG 无魔数前缀故被拒） */
function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString('ascii')
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  return null
}

/** busboy 以 latin1 解码 multipart 文件名，中文名按 UTF-8 还原（无效序列回退原值） */
function decodeFileName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name
  const utf8 = Buffer.from(name, 'latin1').toString('utf8')
  return utf8.includes('\ufffd') ? name : utf8
}