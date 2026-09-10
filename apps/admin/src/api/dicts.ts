import type { DictEntry, DictType } from '@/types'
import { dicts } from '@/mock'
import { delay } from './utils'
import { recordAudit } from './auditLogs'

export const dictTypeMap: Record<DictType, string> = {
  demand_category: '需求类别',
  industry: '行业',
  event_type: '活动类型',
}

/* 字典加载失败的回退词表（与 mock/dict.ts 初始数据一致；页面兜底用，正常不会触发） */
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
}

/* TODO: 替换为 GET /api/admin/dicts/:type — 字典项列表（按 sort 升序） */
export async function fetchDictEntries(type: DictType): Promise<DictEntry[]> {
  await delay(250)
  return [...(dicts[type] ?? [])].sort((a, b) => a.sort - b.sort)
}

export interface DictEntryPayload {
  label: string
}

/* TODO: 替换为 POST /api/admin/dicts/:type — 新增字典项（label 全类型唯一，创建即启用） */
export async function createDictEntry(type: DictType, payload: DictEntryPayload): Promise<DictEntry> {
  await delay(400)
  const label = payload.label.trim()
  if (!label) throw new Error('请输入字典项名称')
  const all = Object.values(dicts).flat()
  if (all.some((e) => e.label === label)) throw new Error('字典项名称已存在')
  const list = dicts[type]
  const prefixes: Record<DictType, string> = { demand_category: 'DC', industry: 'IN', event_type: 'ET' }
  const maxNum = list.reduce((m, e) => Math.max(m, Number(e.code.replace(/\D/g, ''))), 0)
  const entry: DictEntry = {
    code: `${prefixes[type]}${String(maxNum + 1).padStart(3, '0')}`,
    label,
    sort: list.length + 1,
    status: 'enabled',
  }
  list.push(entry)
  recordAudit('系统管理', '新增字典项', `${dictTypeMap[type]} · ${label}`)
  return entry
}

/* TODO: 替换为 POST /api/admin/dicts/:type/:code/toggle-status — 启用/停用（停用后选项不再下发） */
export async function toggleDictEntry(type: DictType, code: string): Promise<{ code: number }> {
  await delay(300)
  const entry = dicts[type]?.find((e) => e.code === code)
  if (!entry) throw new Error('字典项不存在')
  entry.status = entry.status === 'enabled' ? 'disabled' : 'enabled'
  recordAudit('系统管理', entry.status === 'enabled' ? '启用字典项' : '停用字典项', `${dictTypeMap[type]} · ${entry.label}`)
  return { code: 0 }
}

/* TODO: 替换为 DELETE /api/admin/dicts/:type/:code — 删除字典项（历史数据已引用的值不受影响，仅不再作为选项下发） */
export async function deleteDictEntry(type: DictType, code: string): Promise<{ code: number }> {
  await delay(350)
  const list = dicts[type]
  const idx = list?.findIndex((e) => e.code === code) ?? -1
  if (idx < 0) throw new Error('字典项不存在')
  const [removed] = list.splice(idx, 1)
  /* 删除后重排 sort，保持连续 */
  list.forEach((e, i) => (e.sort = i + 1))
  recordAudit('系统管理', '删除字典项', `${dictTypeMap[type]} · ${removed.label}`)
  return { code: 0 }
}
