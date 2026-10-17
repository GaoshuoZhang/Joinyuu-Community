/* 生产静态服务（零依赖，仅用 Node 内置模块）：供 1Panel「运行环境 → Node.js」容器托管移动端产物。
 *
 * 能力：
 *   - 正确 MIME；index.html 不缓存（避免升级后拿到旧壳）；带哈希的 assets 长缓存 + immutable
 *   - 只服务 apps/client-mobile/dist/ 目录内的文件，越界路径一律 403（防目录穿越）
 *   - **history 路由兜底**：未命中的路径回落 index.html（等价 Nginx 的 try_files $uri $uri/ /index.html）
 *   - 「/api/ 前缀」的请求反向代理到后端（默认 http://joinyuu-api:7757，容器网络内按容器名解析）：
 *     这样「IP + 端口」直连本容器时也能正常调用后端；若已由 Nginx 反代 /api，
 *     可设 API_PROXY_TARGET= 为空来关闭本代理
 *   - 非 /api 的其它方法返回 405（本服务只发文件）
 *
 * 使用方式：
 *   1) 只服务已构建产物：容器启动命令填 `pnpm serve:mobile`（更新时把新 dist 放进项目目录后重启容器）
 *   2) 容器内构建再服务：容器启动命令填 `pnpm start:mobile`
 *
 * 端口：取环境变量 PORT，缺省 7759；代理目标：API_PROXY_TARGET，缺省 http://joinyuu-api:7757。
 */
import { createServer, request as httpRequest } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = resolve(fileURLToPath(new URL('./dist/', import.meta.url)))
const PORT = Number(process.env.PORT ?? 7759)
const HOST = process.env.HOST ?? '0.0.0.0'
const INDEX = join(DIST, 'index.html')
const API_TARGET = (process.env.API_PROXY_TARGET ?? 'http://joinyuu-api:7757').trim()
/** 上游超时（ms）：上传/导出等长请求留足时间 */
const PROXY_TIMEOUT = 300_000

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

/* 「/api/ 前缀」的反向代理：保持方法/头/体原样转发；透传客户端真实 IP 供后端审计与限流使用 */
function proxyToApi(req, res) {
  let target
  try {
    target = new URL(API_TARGET)
  } catch {
    send(res, 502, '')
    return
  }
  /* 客户端 IP 取值：上游反代声明的 X-Real-IP 优先，其次直接连接的对端地址。
   * 不能把对端地址追加到已有的 X-Forwarded-For 后面：容器端口经宿主机发布后，「从宿主机/网关
   * 连进来」的对端地址会退化成 docker 网关（表现为 172.18.0.1），追加进去会让后端把网关当成
   * 客户端（Express 的 trust proxy 取 X-Forwarded-For 的最后一跳），于是经反向代理（域名）访问时
   * 登录日志记的就成了 172.18.0.1 而不是真实 IP。这里统一改写为单值，保证后端收到的就是直接
   * 上游声明的客户端地址（域名访问=反代声明的 $remote_addr；IP 直连=真实对端地址）。 */
  const declaredIp = String(req.headers['x-real-ip'] ?? '').trim()
  const clientIp = declaredIp || req.socket.remoteAddress || ''
  const headers = {
    ...req.headers,
    host: target.host,
    'x-forwarded-for': clientIp,
    'x-forwarded-proto': (req.headers['x-forwarded-proto'] ?? 'http'),
  }
  const upstream = httpRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: req.url,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.setTimeout(PROXY_TIMEOUT, () => upstream.destroy(new Error('upstream timeout')))
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ code: 502, message: '后端服务暂不可用，请稍后重试' }))
    }
    res.destroy()
  })
  req.pipe(upstream)
}

const server = createServer((req, res) => {
  const rawPath = (req.url ?? '/').split('?')[0]
  let urlPath = '/'
  try {
    urlPath = decodeURIComponent(rawPath)
  } catch {
    send(res, 400, '')
    return
  }

  /* 接口请求一律交给后端（含 POST/PUT 等写操作，故必须放在方法检查之前） */
  if (API_TARGET && (urlPath === '/api' || urlPath.startsWith('/api/'))) {
    proxyToApi(req, res)
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' })
    res.end()
    return
  }

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
  console.log(`[mobile] 静态服务已启动：http://${HOST}:${PORT}（目录 ${DIST}；/api 代理 ${API_TARGET || '已关闭'}）`)
})
