import { Injectable } from '@nestjs/common'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/* 对象存储抽象：默认本地磁盘驱动（uploads/ 目录），接口与对象存储一致，
 * 后续接入 MinIO 只需替换本服务的实现（put/remove/read 语义不变）。
 * 存储键形如 `assets/2026/09/<uuid>.<ext>`，通过 /api/public/files/:key 对外读取。 */

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads')

@Injectable()
export class StorageService {
  /** 写入对象 */
  async put(key: string, buffer: Buffer): Promise<void> {
    const target = join(UPLOAD_ROOT, key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, buffer)
  }

  /** 删除对象（不存在时静默） */
  async remove(key: string): Promise<void> {
    await rm(join(UPLOAD_ROOT, key), { force: true })
  }

  /** 读取对象（不存在返回 null） */
  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(join(UPLOAD_ROOT, key))
    } catch {
      return null
    }
  }

  /** 对外访问 URL（相对路径，经前端/网关代理） */
  url(key: string): string {
    return `/api/public/files/${key}`
  }
}
