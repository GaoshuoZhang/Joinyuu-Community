import type { IdentityType } from '@/types'

/* 身份词汇表（冻结）：所有页面统一取用，禁止自造身份文案 */

export const identityTypeMap: Record<IdentityType, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
  external_individual: '外部个人',
  external_company: '外部企业',
}

export const roleLabelMap: Record<'founder' | 'admin' | 'member', string> = {
  founder: '创始人',
  admin: '管理员',
  member: '成员',
}

/* 用户身份快速筛选项：个人用户 = 仅持有基础个人身份（未关联其他身份） */
export const userCategoryOptions = [
  { label: '全部', value: '' },
  { label: '个人用户', value: 'individual' },
  { label: '社区个体', value: 'community_individual' },
  { label: '社区企业', value: 'community_enterprise' },
  { label: '合作企业', value: 'external_enterprise' },
]

/* 经验值等级 1-5 级（仅社区个体/社区企业身份拥有经验值，参加活动、承接项目累积） */
export const userLevelMap: Record<string, string> = {
  '1': '1 级',
  '2': '2 级',
  '3': '3 级',
  '4': '4 级',
  '5': '5 级',
}

export const userLevelOptions = [
  { label: '1 级（最低）', value: '1' },
  { label: '2 级', value: '2' },
  { label: '3 级', value: '3' },
  { label: '4 级', value: '4' },
  { label: '5 级（最高）', value: '5' },
]

/* 需求/活动可见与可报名范围 - 身份筛选项（空选择 = 不限）
 * 个人用户与合作企业均无经验值等级，故标注不受等级约束 */
export const visibilityIdentityOptions = [
  { label: '个人用户（不受等级约束）', value: 'individual' },
  { label: '社区个体', value: 'community_individual' },
  { label: '社区企业', value: 'community_enterprise' },
  { label: '合作企业（不受等级约束）', value: 'external_enterprise' },
]
