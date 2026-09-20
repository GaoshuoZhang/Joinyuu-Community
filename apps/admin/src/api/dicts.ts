import type { DictEntry, DictType } from '@/types'
import { httpDelete, httpGet, httpPost } from './http'

export const dictTypeMap: Record<DictType, string> = {
  demand_category: '需求类别',
  industry: '行业',
  event_type: '活动类型',
  goods_category: '商品类型',
}

/* 字典加载失败的回退词表（与种子数据初始值一致；页面兜底用，正常不会触发） */
export const dictFallback: Record<DictType, string[]> = {
  demand_category: ['供应链', '设计', '法务财务', '技术开发', '市场', '人力资源'],
  industry: [
    '人工智能',
    '芯片半导体',
    '文化创意',
    '企业服务 SaaS',
    '新材料',
    '智慧交通',
    '设计服务',
    '商业航天',
    '医疗健康',
    '风险投资',
    '财务咨询',
  ],
  event_type: ['沙龙', '培训', '路演', '社交', '赛事'],
  goods_category: ['实物商品', '权益券'],
}

/* GET /api/admin/dicts/:type — 字典项列表（按 sort 升序，管理页返回全量，
 * 下拉消费方按 status=enabled 过滤；服务端 10min 缓存，写操作主动失效） */
export async function fetchDictEntries(type: DictType): Promise<DictEntry[]> {
  return httpGet<DictEntry[]>(`/dicts/${type}`)
}

export interface DictEntryPayload {
  label: string
}

/* POST /api/admin/dicts/:type — 新增字典项（label 全类型唯一，新增即启用） */
export async function createDictEntry(type: DictType, payload: DictEntryPayload): Promise<DictEntry> {
  return httpPost<DictEntry>(`/dicts/${type}`, payload)
}

/* POST /api/admin/dicts/:type/:code/toggle-status — 启用/停用（停用后选项不再下发） */
export async function toggleDictEntry(type: DictType, code: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/dicts/${type}/${code}/toggle-status`)
}

/* DELETE /api/admin/dicts/:type/:code — 删除字典项（历史数据已引用的值不受影响） */
export async function deleteDictEntry(type: DictType, code: string): Promise<{ code: number }> {
  return httpDelete<{ code: number }>(`/dicts/${type}/${code}`)
}
