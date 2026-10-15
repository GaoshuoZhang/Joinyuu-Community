import { BadRequestException } from '@nestjs/common'

/** Store host:port inputs as supplied; consumers add HTTP only when no scheme is present. */
export function normalizeMobileUrl(value: unknown): string {
  try {
    if (typeof value !== 'string') throw new Error()
    const address = value.trim()
    if (!address || address.length > 2048 || /[\s\\?#]/.test(address) || address.startsWith('/')) throw new Error()
    const url = new URL(address.includes('://') ? address : `http://${address}`)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error()
    return address
  } catch {
    throw new BadRequestException('移动端访问地址须为有效的 HTTP/HTTPS 地址或主机:端口，不包含查询参数、# 或账号密码')
  }
}
