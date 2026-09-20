import type { DictEntry, DictType } from '@/types'

/* 数据字典 — 站点选项词汇的单一来源（M0-E 起）
 * 需求类别 / 行业 / 活动类型等下拉选项统一从字典取用，
 * 页面不再硬编码（此前需求类别在 3 处重复硬编码，已收敛至此）。
 * 注意：字典项 label 即业务存储值，暂不支持改名（避免历史数据失配），支持新增/启停/删除/排序。 */
export const dicts: Record<DictType, DictEntry[]> = {
  demand_category: [
    { code: 'DC001', label: '供应链', sort: 1, status: 'enabled' },
    { code: 'DC002', label: '设计', sort: 2, status: 'enabled' },
    { code: 'DC003', label: '法务财务', sort: 3, status: 'enabled' },
    { code: 'DC004', label: '技术开发', sort: 4, status: 'enabled' },
    { code: 'DC005', label: '市场', sort: 5, status: 'enabled' },
    { code: 'DC006', label: '人力资源', sort: 6, status: 'enabled' },
  ],
  industry: [
    { code: 'IN001', label: '人工智能', sort: 1, status: 'enabled' },
    { code: 'IN002', label: '芯片半导体', sort: 2, status: 'enabled' },
    { code: 'IN003', label: '文化创意', sort: 3, status: 'enabled' },
    { code: 'IN004', label: '企业服务 SaaS', sort: 4, status: 'enabled' },
    { code: 'IN005', label: '新材料', sort: 5, status: 'enabled' },
    { code: 'IN006', label: '智慧交通', sort: 6, status: 'enabled' },
    { code: 'IN007', label: '设计服务', sort: 7, status: 'enabled' },
    { code: 'IN008', label: '商业航天', sort: 8, status: 'enabled' },
    { code: 'IN009', label: '医疗健康', sort: 9, status: 'enabled' },
    { code: 'IN010', label: '风险投资', sort: 10, status: 'enabled' },
    { code: 'IN011', label: '财务咨询', sort: 11, status: 'enabled' },
  ],
  event_type: [
    { code: 'ET001', label: '沙龙', sort: 1, status: 'enabled' },
    { code: 'ET002', label: '培训', sort: 2, status: 'enabled' },
    { code: 'ET003', label: '路演', sort: 3, status: 'enabled' },
    { code: 'ET004', label: '社交', sort: 4, status: 'enabled' },
    { code: 'ET005', label: '赛事', sort: 5, status: 'enabled' },
  ],
  goods_category: [
    { code: 'GC001', label: '实物商品', sort: 1, status: 'enabled' },
    { code: 'GC003', label: '权益券', sort: 3, status: 'enabled' },
  ],
}
