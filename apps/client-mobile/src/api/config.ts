import { httpGet } from './http'
import type { AppConfig, DictItem } from '@/types'

/** GET /api/app/config — 站点信息与功能开关 */
export async function fetchAppConfig(): Promise<AppConfig> {
  return httpGet<AppConfig>('/config')
}

/** GET /api/app/dicts/:type — 仅启用项（类型：demand_category/industry/event_type/goods_category） */
export async function fetchDict(type: string): Promise<DictItem[]> {
  return (await httpGet<{ type: string; items: DictItem[] }>(`/dicts/${type}`)).items
}
