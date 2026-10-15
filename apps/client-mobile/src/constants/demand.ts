import type { DemandKind } from '@/types'
import { formatLocalDate } from '@/utils/format'

/** 需求类型元数据（发布 hub / 表单 / 列表与详情的类型标签共用） */
export interface DemandKindMeta {
  kind: DemandKind
  title: string
  /** 发布 hub 卡片标题图标（TDesign 图标名） */
  icon: string
  /** 需求页该分类的搜索框占位文案 */
  searchPlaceholder: string
  tagline: string
  /** 发布后的推进流程（步骤文案） */
  process: string[]
  bullets: string[]
  cta: string
}

export const DEMAND_KINDS: DemandKindMeta[] = [
  {
    kind: 'task',
    title: '找服务',
    icon: 'service',
    searchPlaceholder: '搜索服务需求',
    tagline: '有想法、有需求，只差一位靠谱的人把它做出来',
    process: ['发布需求', '响应接单', '立项协作', '结项交付'],
    bullets: [
      '适合外包承接、专项执行与合伙落地',
      '说清期望交付与预算范围，沟通更高效',
      '社区成员与企业可直接响应联系',
      '审核通过后展示在需求列表',
    ],
    cta: '发布找服务需求',
  },
  {
    kind: 'investment',
    title: '找投资',
    icon: 'money',
    searchPlaceholder: '搜索投资需求',
    tagline: '有方向、有规划，正在寻找同频的投资人与资源伙伴',
    process: ['发布需求', '投资洽谈', '立项协作', '结项交付'],
    bullets: [
      '适合天使轮、战略融资与资源型合作',
      '展示所属行业与所需支持，精准触达',
      '对接社区内的投资人、企业与机构',
      '审核通过后公开展示，等待洽谈',
    ],
    cta: '发布找投资需求',
  },
  {
    kind: 'cooperation',
    title: '找合作',
    icon: 'link',
    searchPlaceholder: '搜索合作需求',
    tagline: '业务遇到瓶颈，希望找到互补的团队一起破局',
    process: ['发布需求', '建立联系', '达成合作'],
    bullets: [
      '适合渠道、供应链、技术与资源互补',
      '讲清业务瓶颈与合作诉求，降低沟通成本',
      '合作方主动联系，确认意向即可启动',
      '轻量协作，找到合作方即达成目标',
    ],
    cta: '发布找合作需求',
  },
]

export const DEMAND_KIND_LABELS: Record<DemandKind, string> = {
  task: '找服务',
  investment: '找投资',
  cooperation: '找合作',
}

/** Keep response cutoff and expected delivery dates labeled by their source fields. */
export function demandDateText(d: { deliverBy?: string; deadline?: string }): string {
  if (d.deadline) return `响应截止 ${formatLocalDate(d.deadline)}`
  if (d.deliverBy) return `预期交付 ${formatLocalDate(d.deliverBy)}`
  return ''
}
