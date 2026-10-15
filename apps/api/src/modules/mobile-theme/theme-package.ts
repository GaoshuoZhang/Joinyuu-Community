import { BadRequestException } from '@nestjs/common'
import { fromBuffer } from 'yauzl'

export const HOME_MODULES = ['banner', 'entries', 'publish', 'activation', 'announcement', 'events', 'demands', 'articles'] as const
export interface ThemeManifest {
  schemaVersion: 1
  id: string
  name: string
  version: string
  description?: string
  brand?: { name?: string; slogan?: string; logo?: string; logoDark?: string; logoShape?: 'square' | 'wordmark'; homeBackground?: string; eyebrow?: string; headline?: string; highlight?: string }
  tokens?: { light?: ThemeColors; dark?: ThemeColors; radius?: 'small' | 'medium' | 'large' }
  layout?: { template?: 'default' | 'brand'; homeModules?: string[] }
}
export interface ThemeColors { primary?: string; accent?: string; primaryLight?: string; background?: string; surface?: string; text?: string; secondaryText?: string; heroStart?: string; heroEnd?: string }
const fail = (message: string): never => { throw new BadRequestException(message) }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((key) => !allowed.includes(key))) fail('主题包含不支持的配置字段')
}
function text(v: unknown, max: number): v is string { return typeof v === 'string' && v.trim().length > 0 && v.length <= max }
export function safeAssetPath(path: string): boolean {
  return /^assets\/[a-zA-Z0-9_/-]+\.(png|jpg|jpeg|webp)$/.test(path) && !path.split('/').some((part) => !part || part === '.' || part === '..')
}
export function validateManifest(value: unknown): ThemeManifest {
  if (!record(value)) return fail('manifest.json 必须是对象')
  keys(value, ['schemaVersion', 'id', 'name', 'version', 'description', 'brand', 'tokens', 'layout'])
  if (value.schemaVersion !== 1) fail('不支持此主题协议版本，当前支持版本 1')
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value.id)) fail('主题 id 必须为小写字母开头的字母、数字或连字符，最多 64 位')
  if (!text(value.name, 60) || typeof value.version !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value.version)) fail('主题名称或版本格式错误')
  if (value.description !== undefined && !text(value.description, 500)) fail('主题说明最多 500 字')
  if (value.brand !== undefined) {
    if (!record(value.brand)) return fail('brand 必须是对象')
    keys(value.brand, ['name', 'slogan', 'logo', 'logoDark', 'logoShape', 'homeBackground', 'eyebrow', 'headline', 'highlight'])
    for (const [key, max] of Object.entries({ name: 60, slogan: 160, eyebrow: 60, headline: 100, highlight: 40 })) {
      if (value.brand[key] !== undefined && !text(value.brand[key], max)) fail(`品牌字段 ${key} 必须为非空文本且最多 ${max} 字`)
    }
    if (value.brand.logoShape !== undefined && (typeof value.brand.logoShape !== 'string' || !['square', 'wordmark'].includes(value.brand.logoShape))) fail('Logo 形态必须为 square 或 wordmark')
    if (value.brand.highlight !== undefined && (typeof value.brand.headline !== 'string' || !value.brand.headline.includes(value.brand.highlight as string))) fail('标题强调词必须包含在 headline 中')
    for (const key of ['logo', 'logoDark', 'homeBackground']) if (value.brand[key] !== undefined && (typeof value.brand[key] !== 'string' || !safeAssetPath(value.brand[key] as string))) fail('品牌图片必须引用 assets/ 内的 PNG、JPEG 或 WebP')
    if (value.brand.logoDark !== undefined && value.brand.logo === undefined) fail('配置深色 Logo 时必须同时提供 logo')
  }
  if (value.tokens !== undefined) {
    if (!record(value.tokens)) return fail('tokens 必须是对象')
    keys(value.tokens, ['light', 'dark', 'radius'])
    if (value.tokens.radius !== undefined && (typeof value.tokens.radius !== 'string' || !['small', 'medium', 'large'].includes(value.tokens.radius))) fail('圆角配置不受支持')
    for (const mode of ['light', 'dark']) {
      const colors = value.tokens[mode]
      if (colors === undefined) continue
      if (!record(colors)) return fail('配色必须是对象')
      keys(colors, ['primary', 'accent', 'primaryLight', 'background', 'surface', 'text', 'secondaryText', 'heroStart', 'heroEnd'])
      if (Object.values(colors).some((color) => typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) fail('颜色必须是六位十六进制值，例如 #0052d9')
    }
  }
  if (value.layout !== undefined) {
    if (!record(value.layout)) return fail('layout 必须是对象')
    keys(value.layout, ['template', 'homeModules'])
    if (value.layout.template !== undefined && (typeof value.layout.template !== 'string' || !['default', 'brand'].includes(value.layout.template))) fail('布局模板不受支持')
    const modules = value.layout.homeModules
    if (modules !== undefined && (!Array.isArray(modules) || modules.length > HOME_MODULES.length || modules.some((m) => !HOME_MODULES.includes(m)) || new Set(modules).size !== modules.length)) fail('首页模块必须为不重复的已知模块标识')
  }
  return value as unknown as ThemeManifest
}

/** Lazy extraction with both declared and actual limits; never extracts paths onto disk. */
export async function readThemeZip(buffer: Buffer): Promise<{ manifest: ThemeManifest; assets: Map<string, Buffer> }> {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) fail('主题包不能为空且不能超过 10 MB')
  const files = await new Promise<Map<string, Buffer>>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(new BadRequestException('主题包不是有效 ZIP')); return }
      const files = new Map<string, Buffer>()
      const names = new Set<string>()
      let total = 0
      const stop = (message: string) => { zip.close(); reject(new BadRequestException(message)) }
      if (zip.entryCount > 100) { stop('主题包最多包含 100 个条目'); return }
      zip.on('error', () => stop('ZIP 读取失败或文件大小异常'))
      zip.on('end', () => resolve(files))
      zip.on('entry', (entry) => {
        const path = entry.fileName
        if (names.has(path)) { stop('主题包包含重复路径'); return }
        names.add(path)
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000
        if (mode === 0xa000 || entry.isEncrypted()) { stop('主题包不能包含符号链接或加密文件'); return }
        if (path.endsWith('/')) {
          if (!/^assets\/(?:[a-zA-Z0-9_-]+\/)*$/.test(path)) { stop('主题包包含不支持的目录'); return }
          zip.readEntry(); return
        }
        if (path !== 'manifest.json' && !safeAssetPath(path)) { stop('主题包只能包含根目录 manifest.json 和 assets/ 内的图片'); return }
        const limit = path === 'manifest.json' ? 64 * 1024 : 2 * 1024 * 1024
        if (entry.uncompressedSize > limit || total + entry.uncompressedSize > 20 * 1024 * 1024) { stop('主题文件或解压总大小超限'); return }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { stop('主题文件读取失败'); return }
          const chunks: Buffer[] = []
          let size = 0
          stream.on('error', () => stop('主题文件解压失败'))
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length
            total += chunk.length
            if (size > limit || total > 20 * 1024 * 1024) { stream.destroy(); stop('主题文件或解压总大小超限'); return }
            chunks.push(chunk)
          })
          stream.on('end', () => { files.set(path, Buffer.concat(chunks)); zip.readEntry() })
        })
      })
      zip.readEntry()
    })
  })
  const raw = files.get('manifest.json')
  if (!raw) return fail('主题包根目录缺少 manifest.json')
  let parsed: unknown
  try { parsed = JSON.parse(raw.toString('utf8')) } catch { return fail('manifest.json 不是有效 JSON') }
  const manifest = validateManifest(parsed)
  files.delete('manifest.json')
  for (const [path, data] of files) {
    if (!imageMime(path, data)) fail(`图片格式与内容不匹配：${path}`)
  }
  for (const path of [manifest.brand?.logo, manifest.brand?.logoDark, manifest.brand?.homeBackground]) if (path && !files.has(path)) fail(`缺少主题资源：${path}`)
  return { manifest, assets: files }
}
export function imageMime(path: string, data: Buffer): string | null {
  if (/\.png$/.test(path) && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (/\.jpe?g$/.test(path) && data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg'
  if (/\.webp$/.test(path) && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}
