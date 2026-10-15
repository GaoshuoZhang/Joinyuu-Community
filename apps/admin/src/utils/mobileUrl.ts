/** 与 API 的移动端地址约束一致；保留部署子路径，拒绝携带凭据、查询参数或片段的地址。 */
export function parseMobileUrl(value: string): URL | null {
  const address = value.trim()
  if (!address || address.length > 2048 || /[\s\\?#]/.test(address) || address.startsWith('/')) return null
  try {
    const url = new URL(address.includes('://') ? address : `http://${address}`)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url : null
  } catch {
    return null
  }
}
