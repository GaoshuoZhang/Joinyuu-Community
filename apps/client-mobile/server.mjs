/* 生产静态服务（零依赖，仅用 Node 内置模块）：供 1Panel「运行环境 → Node.js」容器托管移动端产物。
 *
 * 与「静态网站」由 Nginx 直接发文件的等价实现：
 *   - 正确 MIME；index.html 不缓存（避免升级后拿到旧壳）；带哈希的 assets 长缓存 + immutable
 *   - 只服务 apps/client-mobile/dist/ 目录内的文件，越界路径一律 403（防目录穿越）
 *   - 只接受 GET/HEAD；/api/** 直接 404（该前缀由 Nginx 反向代理到后端，不应落到本服务）
 *
 * **移动端是 history 路由**：任意未命中的路径（如 /me/profile）都回落 index.html，
 * 这正是 Nginx 侧 `try_files $uri $uri/ /index.html;` 的等价物，缺了它刷新页面会 404。
 *
 * 使用方式（两种，二选一）：
 *   1) 只服务已构建好的产物：容器启动命令填 `pnpm serve:mobile`（更新时把新 dist 放进项目目录后重启容器即可）
 *   2) 让容器自己构建再服务：容器启动命令填 `pnpm start:mobile`（需容器已安装依赖，见部署手册）
 *
 * 端口：取环境变量 PORT，缺省 7759。端口需与容器「应用端口」一致。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = resolve(fileURLToPath(new URL('./dist/', import.meta.url)))
const PORT = Number(process.env.PORT ?? 7759)
const HOST = process.env.HOST ?? '0.0.0.0'
const INDEX = join(DIST, 'index.html')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
}

function send(res, status, filePath, extraHeaders = {}) {
  const headers = {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  }
  if (status !== 200) {
    res.writeHead(status, headers)
    res.end()
    return
  }
  const { size } = statSync(filePath)
  headers['Content-Length'] = String(size)
  res.writeHead(status, headers)
  createReadStream(filePath).pipe(res)
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }

  const rawPath = (req.url ?? '/').split('?')[0]
  let urlPath = '/'
  try {
    urlPath = decodeURIComponent(rawPath)
  } catch {
    send(res, 400, '')
    return
  }

  /* /api/** 由 Nginx 反代到后端；若直接命中本服务，返回 404 而不是回落 index.html */
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    send(res, 404, '')
    return
  }

  const target = normalize(join(DIST, urlPath))
  /* 目录穿越防护：normalize 后必须仍在 dist 目录内 */
  if (target !== DIST && !target.startsWith(DIST + sep)) {
    send(res, 403, '')
    return
  }

  if (existsSync(target) && statSync(target).isFile()) {
    const hashed = /-[A-Za-z0-9_]{8}\./.test(target)
    send(res, 200, target, hashed
      ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
      : { 'Cache-Control': 'no-cache' })
    return
  }

  /* SPA 兜底：移动端 history 路由必须靠这一步才能刷新任意页面（等价 Nginx try_files） */
  if (!existsSync(INDEX)) {
    send(res, 503, '')
    return
  }
  send(res, 200, INDEX, { 'Cache-Control': 'no-cache' })
})

server.listen(PORT, HOST, () => {
  console.log(`[mobile] 静态服务已启动：http://${HOST}:${PORT}（目录 ${DIST}）`)
})
