import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../common/prisma/prisma.service'
import { IdGeneratorService } from '../../common/id-generator/id-generator.service'
import { StorageService } from '../../common/storage/storage.service'
import { AuditService } from '../../common/audit/audit.service'
import { formatNow } from '../../common/utils/time'

/** 上传文件（multer 内存存储暴露的最小字段集，避免额外类型依赖） */
export interface UploadedFileLike {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

export interface MallAssetDto {
  id: string
  url: string
  fileName: string
  mime: string
  size: number
  bizType?: string
  sourceType?: string
  sourceId?: string
  createdAt: string
}

/** 允许的 MIME（图片与常用文档；SVG 可携带脚本已禁用） */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
])

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** multer/busboy 以 latin1 解码 multipart 文件名，中文名会乱码；按 UTF-8 还原（无效序列回退原值） */
function decodeFileName(name: string): string {
  if (!/[\u0080-\u00ff]/.test(name)) return name
  const utf8 = Buffer.from(name, 'latin1').toString('utf8')
  return utf8.includes('\ufffd') ? name : utf8
}

/** 魔数嗅探：以文件内容判定真实类型，不信任客户端声明的 mimetype（H4 防伪造） */
function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_MAGIC)) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString('ascii')
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  return null
}

/* 素材库：上传（multipart → 对象存储 + 落库）/ 列表 / 删除（删库 + 删对象）。
 * 存储键为扁平文件名，配合 /api/public/files/:key 读取。 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(bizType?: string): Promise<MallAssetDto[]> {
    const rows = await this.prisma.mallAsset.findMany({
      where: bizType ? { bizType } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map(toAssetDto)
  }

  async upload(file: UploadedFileLike | undefined, bizType: string | undefined, operator: string): Promise<MallAssetDto> {
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('请选择要上传的文件')
    const limitMb = await this.uploadLimitMb()
    if (file.size > limitMb * 1024 * 1024) throw new BadRequestException(`文件大小不能超过 ${limitMb} MB`)
    const mime = sniffMime(file.buffer)
    if (!mime || !ALLOWED_MIME.has(mime)) throw new BadRequestException('不支持的文件类型')

    const storeKey = `${randomUUID()}${MIME_EXT[mime]}`
    await this.storage.put(storeKey, file.buffer)

    const createdAt = formatNow()
    let asset: Awaited<ReturnType<typeof this.prisma.mallAsset.create>>
    try {
      asset = await this.prisma.mallAsset.create({
        data: {
          id: await this.ids.next('AST'),
          fileName: decodeFileName(file.originalname),
          mime,
          size: file.size,
          url: this.storage.url(storeKey),
          storeKey,
          bizType: bizType || null,
          createdBy: operator,
          createdAt,
        },
      })
    } catch (e) {
      /* 落库失败补偿：删除已写入的存储对象，避免孤儿文件 */
      await this.storage.remove(storeKey).catch((): void => undefined)
      throw e
    }
    await this.audit.record({
      module: '素材库',
      action: '上传素材',
      target: `${asset.id} · ${asset.fileName}`,
      operator,
    })
    return toAssetDto(asset)
  }

  /** 替换素材：覆盖同一存储键（URL 不变），引用该素材的文章/页面即时生效 */
  async replace(id: string, file: UploadedFileLike | undefined, operator: string): Promise<MallAssetDto> {
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('请选择要上传的文件')
    const asset = await this.prisma.mallAsset.findUnique({ where: { id } })
    if (!asset) throw new NotFoundException('素材不存在')
    const limitMb = await this.uploadLimitMb()
    if (file.size > limitMb * 1024 * 1024) throw new BadRequestException(`文件大小不能超过 ${limitMb} MB`)
    const mime = sniffMime(file.buffer)
    if (!mime || !ALLOWED_MIME.has(mime)) throw new BadRequestException('不支持的文件类型')
    if (mime !== asset.mime) throw new BadRequestException('替换文件类型须与原文件一致')

    await this.storage.put(asset.storeKey, file.buffer)
    const updated = await this.prisma.mallAsset.update({ where: { id }, data: { size: file.size } })
    await this.audit.record({
      module: '素材库',
      action: '替换素材',
      target: `${asset.id} · ${asset.fileName}`,
      operator,
    })
    return toAssetDto(updated)
  }

  /** 上传大小限制（MB）：读取系统配置，缺省 10（与库表默认值一致） */
  private async uploadLimitMb(): Promise<number> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    return config?.uploadMaxSizeMb ?? 10
  }

  async remove(id: string, operator: string): Promise<{ code: number }> {
    const asset = await this.prisma.mallAsset.findUnique({ where: { id } })
    if (!asset) throw new NotFoundException('素材不存在')
    await this.prisma.mallAsset.delete({ where: { id } })
    try {
      await this.storage.remove(asset.storeKey)
    } catch (e) {
      /* 存储删除失败仅告警：记录已删，残留文件可人工清理 */
      console.error('[assets] 存储对象删除失败:', e instanceof Error ? e.message : e)
    }
    await this.audit.record({
      module: '素材库',
      action: '删除素材',
      target: `${asset.id} · ${asset.fileName}`,
      operator,
    })
    return { code: 0 }
  }

  /** 读取素材二进制（公开文件路由使用；按 storeKey 反查 MIME 与文件名） */
  async readFile(key: string): Promise<{ buffer: Buffer; mime: string; fileName: string } | null> {
    const asset = await this.prisma.mallAsset.findFirst({ where: { storeKey: key } })
    if (!asset) return null
    const buffer = await this.storage.read(key)
    if (!buffer) return null
    return { buffer, mime: asset.mime, fileName: asset.fileName }
  }
}

function toAssetDto(a: {
  id: string
  url: string
  fileName: string
  mime: string
  size: number
  bizType: string | null
  sourceType: string | null
  sourceId: string | null
  createdAt: string
}): MallAssetDto {
  const dto: MallAssetDto = {
    id: a.id,
    url: a.url,
    fileName: a.fileName,
    mime: a.mime,
    size: a.size,
    createdAt: a.createdAt,
  }
  if (a.bizType != null) dto.bizType = a.bizType
  if (a.sourceType != null) dto.sourceType = a.sourceType
  if (a.sourceId != null) dto.sourceId = a.sourceId
  return dto
}
