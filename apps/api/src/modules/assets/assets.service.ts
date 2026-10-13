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

/** 业务来源（关联业务实体的附件，如租约合同）：落 sourceType/sourceId，素材库按来源筛选可见 */
export interface AssetSource {
  type: string
  id: string
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

/** 存储键仅允许扁平文件名（uuid.ext），阻止路径穿越 */
const FLAT_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** 公开读取白名单：仅放行上传服务生成的 uuid 形态键。
 * 可读性命名（如个人数据导出 export-<uid>-<时间戳>.json）即使落在存储根目录也不会被公开路由抓到。 */
const PUBLIC_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
}

function mimeByKey(key: string): string {
  const dot = key.lastIndexOf('.')
  if (dot < 0) return 'application/octet-stream'
  return MIME_BY_EXT[key.slice(dot).toLowerCase()] ?? 'application/octet-stream'
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

  async upload(
    file: UploadedFileLike | undefined,
    bizType: string | undefined,
    operator: string,
    source?: AssetSource,
  ): Promise<MallAssetDto> {
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
          sourceType: source?.type ?? null,
          sourceId: source?.id ?? null,
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
      ...(source ? { detail: `来源：${source.type} ${source.id}` } : {}),
      operator,
    })
    return toAssetDto(asset)
  }

  /** 按业务来源列附件（如某租约的全部合同扫描件，最新在前） */
  async listBySource(source: AssetSource): Promise<MallAssetDto[]> {
    const rows = await this.prisma.mallAsset.findMany({
      where: { sourceType: source.type, sourceId: source.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return rows.map(toAssetDto)
  }

  /** 删除业务来源附件：校验归属（仅允许删除属于该来源的文件），存储与元数据删除沿用 remove */
  async removeBySource(id: string, source: AssetSource, operator: string): Promise<{ code: number }> {
    const asset = await this.prisma.mallAsset.findUnique({ where: { id } })
    if (!asset || asset.sourceType !== source.type || asset.sourceId !== source.id) {
      throw new NotFoundException('附件不存在')
    }
    return this.remove(id, operator)
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

  /** 读取存储对象（公开文件路由使用）。
   * 优先按 storeKey 反查素材库元数据（admin 素材）；App 上传不落素材库，
   * 文件存在时按扩展名推断 MIME 直接返回，避免「已上传但 404」。 */
  async readFile(key: string): Promise<{ buffer: Buffer; mime: string; fileName: string } | null> {
    if (!FLAT_KEY_RE.test(key) || key.includes('..')) return null
    const asset = await this.prisma.mallAsset.findFirst({ where: { storeKey: key } })
    /* 公开路由只暴露「素材库登记键」或「uuid 形态的上传键」，其余（含个人数据导出等可枚举命名）一律拒绝 */
    if (!asset && !PUBLIC_KEY_RE.test(key)) return null
    const buffer = await this.storage.read(key)
    if (!buffer) return null
    if (asset) return { buffer, mime: asset.mime, fileName: asset.fileName }
    return { buffer, mime: mimeByKey(key), fileName: key }
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
