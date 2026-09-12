import { Injectable } from '@nestjs/common'
import { Client } from 'minio'
import type { Readable } from 'node:stream'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PrismaService } from '../prisma/prisma.service'

/* 对象存储抽象：默认本地磁盘驱动（uploads/ 目录），可在系统配置中切换到 MinIO（R4）。
 * put/read/remove 语义两驱动一致；存储键形如 `assets/2026/09/<uuid>.<ext>`，
 * 通过 /api/public/files/:key 对外读取（URL 与驱动无关）。
 * MinIO 判定结果带 60s 进程内缓存（配置保存后由 SystemConfigService 调用 invalidateConfig()
 * 立即失效）；客户端按需懒创建，首次使用时确保桶存在。 */

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads')
const CONFIG_CACHE_TTL_MS = 60_000

interface MinioRuntimeConfig {
  endPoint: string
  port: number
  useSSL: boolean
  accessKey: string
  secretKey: string
  bucket: string
}

interface MinioRuntime {
  client: Client
  bucket: string
}

@Injectable()
export class StorageService {
  private runtimeConfig: MinioRuntimeConfig | null = null
  private configLoadedAt = 0
  private minio: MinioRuntime | null = null
  private bucketReady: Promise<void> | null = null

  constructor(private readonly prisma: PrismaService) {}

  /** 系统配置保存后调用：清空判定缓存与客户端，下一次读写按新配置生效 */
  invalidateConfig(): void {
    this.configLoadedAt = 0
    this.runtimeConfig = null
    this.minio = null
    this.bucketReady = null
  }

  /** 写入对象（mime 供 MinIO 记录 Content-Type，本地驱动忽略） */
  async put(key: string, buffer: Buffer, mime?: string): Promise<void> {
    const runtime = await this.resolveMinio()
    if (!runtime) {
      const target = join(UPLOAD_ROOT, key)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, buffer)
      return
    }
    await runtime.client.putObject(runtime.bucket, key, buffer, buffer.length, {
      'Content-Type': mime || 'application/octet-stream',
    })
  }

  /** 删除对象（不存在时静默） */
  async remove(key: string): Promise<void> {
    const runtime = await this.resolveMinio()
    if (!runtime) {
      await rm(join(UPLOAD_ROOT, key), { force: true })
      return
    }
    await runtime.client.removeObject(runtime.bucket, key)
  }

  /** 读取对象（不存在或读取失败返回 null，两驱动语义一致） */
  async read(key: string): Promise<Buffer | null> {
    try {
      const runtime = await this.resolveMinio()
      if (!runtime) return await readFile(join(UPLOAD_ROOT, key))
      const stream = await runtime.client.getObject(runtime.bucket, key)
      return await toBuffer(stream)
    } catch {
      return null
    }
  }

  /** 对外访问 URL（相对路径，经前端/网关代理） */
  url(key: string): string {
    return `/api/public/files/${key}`
  }

  /** MinIO 运行时解析：60s 缓存判定；配置变化时丢弃旧客户端 */
  private async resolveMinio(): Promise<MinioRuntime | null> {
    const now = Date.now()
    if (now - this.configLoadedAt > CONFIG_CACHE_TTL_MS) {
      const loaded = await this.loadMinioConfig()
      if (JSON.stringify(loaded) !== JSON.stringify(this.runtimeConfig)) {
        this.minio = null
        this.bucketReady = null
      }
      this.runtimeConfig = loaded
      this.configLoadedAt = now
    }
    const config = this.runtimeConfig
    if (!config) return null
    if (!this.minio) {
      this.minio = {
        client: new Client({
          endPoint: config.endPoint,
          port: config.port,
          useSSL: config.useSSL,
          accessKey: config.accessKey,
          secretKey: config.secretKey,
        }),
        bucket: config.bucket,
      }
    }
    await this.ensureBucket(this.minio)
    return this.minio
  }

  /** 首次使用时确保桶存在（配置变化重建客户端后重新检查；失败则下次重试） */
  private async ensureBucket(runtime: MinioRuntime): Promise<void> {
    if (this.bucketReady) {
      await this.bucketReady
      return
    }
    const ready = (async (): Promise<void> => {
      const exists = await runtime.client.bucketExists(runtime.bucket)
      if (!exists) await runtime.client.makeBucket(runtime.bucket)
    })()
    this.bucketReady = ready
    void ready.catch((): void => {
      if (this.bucketReady === ready) this.bucketReady = null
    })
    await ready
  }

  /** 读取系统配置单例并判定是否启用 MinIO（四要素齐全才启用） */
  private async loadMinioConfig(): Promise<MinioRuntimeConfig | null> {
    const config = await this.prisma.systemConfig.findUnique({ where: { id: 1 } })
    if (!config || !config.minioEnabled) return null
    if (!config.minioEndpoint || !config.minioAccessKey || !config.minioSecretKey) return null
    return {
      endPoint: config.minioEndpoint,
      port: config.minioPort,
      useSSL: config.minioUseSsl,
      accessKey: config.minioAccessKey,
      secretKey: config.minioSecretKey,
      bucket: config.minioBucket || 'joinyuu',
    }
  }
}

/** MinIO getObject 可读流转 Buffer */
async function toBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
  }
  return Buffer.concat(chunks)
}
