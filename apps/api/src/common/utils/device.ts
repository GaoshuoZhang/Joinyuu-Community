/** 由 User-Agent 粗解析设备（浏览器 / 操作系统），用于登录日志与会话展示 */
export function parseDevice(userAgent: string): string {
  const ua = userAgent || ''
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Unknown'
  /* iOS 真机 UA 含 "like Mac OS X"，必须先于 Mac OS X 分支判断 */
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown'
  return `${browser} / ${os}`
}

interface GeoLookup {
  country: string
  region: string
  city: string
}

/** geoip-lite 懒加载（仅在公网 IP 查询时加载本地库），失败静默置空 */
let geoip: { lookup(ip: string): GeoLookup | null } | null = null

function lookupGeoip(ip: string): GeoLookup | null {
  try {
    if (geoip === null) {
      // geoip-lite 为 CJS 包，懒加载避免启动即载入 IP 库（同步签名无法使用动态 import）
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      geoip = require('geoip-lite') as { lookup(ip: string): GeoLookup | null }
    }
    return geoip.lookup(ip)
  } catch {
    return null
  }
}

/** 公网 IP 解析结果进程内缓存（上限 1000，超出剔除最早写入项） */
const REGION_CACHE_CAP = 1000
const regionCache = new Map<string, string>()

/** 由 IP 粗判区域：内网/本地标注；公网命中 geoip 返回「国家 省 市」，未命中留空 */
export function parseRegion(ip: string): string {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) return '内网'

  const cached = regionCache.get(ip)
  if (cached !== undefined) return cached

  let region = ''
  const hit = lookupGeoip(ip)
  if (hit) {
    const country = hit.country === 'CN' ? '中国' : hit.country
    region = [country, hit.region, hit.city].filter(Boolean).join(' ').trim()
  }

  if (regionCache.size >= REGION_CACHE_CAP) {
    const oldest = regionCache.keys().next().value
    if (oldest !== undefined) regionCache.delete(oldest)
  }
  regionCache.set(ip, region)
  return region
}
