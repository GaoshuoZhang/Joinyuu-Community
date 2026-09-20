import { AssetsService } from './assets.service'
import type { PrismaService } from '../../common/prisma/prisma.service'
import type { StorageService } from '../../common/storage/storage.service'

/* 公开文件读取：admin 素材走库表元数据；App 上传不落素材库，按扩展名推断 MIME（回归 https 404）。 */
describe('AssetsService.readFile', () => {
  const storage = { read: jest.fn() }
  const prisma = { mallAsset: { findFirst: jest.fn() } }
  const service = new AssetsService(
    prisma as unknown as PrismaService,
    {} as never,
    storage as unknown as StorageService,
    {} as never,
  )

  beforeEach(() => jest.clearAllMocks())

  it('App 上传（无素材库记录）按扩展名返回 MIME 与文件名', async () => {
    storage.read.mockResolvedValue(Buffer.from('png-bytes'))
    prisma.mallAsset.findFirst.mockResolvedValue(null)

    const file = await service.readFile('60428ced-03aa-4b1b-9d3f-a1183a317b04.png')

    expect(file).toEqual({
      buffer: Buffer.from('png-bytes'),
      mime: 'image/png',
      fileName: '60428ced-03aa-4b1b-9d3f-a1183a317b04.png',
    })
  })

  it('素材库记录优先：返回库表 MIME 与原始文件名', async () => {
    storage.read.mockResolvedValue(Buffer.from('jpg-bytes'))
    prisma.mallAsset.findFirst.mockResolvedValue({ mime: 'image/jpeg', fileName: '演示素材.jpg' })

    const file = await service.readFile('abc.jpg')

    expect(file).toEqual({ buffer: Buffer.from('jpg-bytes'), mime: 'image/jpeg', fileName: '演示素材.jpg' })
  })

  it('未知扩展名回退 application/octet-stream', async () => {
    storage.read.mockResolvedValue(Buffer.from('x'))
    prisma.mallAsset.findFirst.mockResolvedValue(null)
    await expect(service.readFile('file.bin')).resolves.toMatchObject({ mime: 'application/octet-stream' })
  })

  it('文件不存在 → null（404）', async () => {
    storage.read.mockResolvedValue(null)
    await expect(service.readFile('missing.png')).resolves.toBeNull()
  })

  it('拒绝路径穿越键且不触碰存储', async () => {
    storage.read.mockResolvedValue(Buffer.from('secret'))
    await expect(service.readFile('../secret.png')).resolves.toBeNull()
    await expect(service.readFile('..%2Fsecret.png')).resolves.toBeNull()
    await expect(service.readFile('nested/path.png')).resolves.toBeNull()
    expect(storage.read).not.toHaveBeenCalled()
  })
})
