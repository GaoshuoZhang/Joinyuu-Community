/* 服务端健康与版本（GET /api/health，公开接口）：供「系统管理 → 关于」页展示服务端版本，
 * 与后台自身版本对照，便于排查前后端版本不一致。
 * 注意：这里**不能**走 api/http.ts——它固定以 /api/admin 为前缀（health 在 /api 下，会 404），
 * 因此直接请求公开路径并解包 { code, data } 包络。 */
export interface ServiceHealthDto {
  status: string
  version: string
}

export async function fetchServiceHealth(): Promise<ServiceHealthDto> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(`服务端健康检查失败（${res.status}）`)
  const payload = (await res.json()) as { code?: number; data?: ServiceHealthDto }
  if (payload.code !== 0 || !payload.data) throw new Error('服务端健康检查响应异常')
  return payload.data
}
