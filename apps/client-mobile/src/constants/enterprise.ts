import type { EnterpriseMemberPermission } from '@/types'

/** 企业成员权限目录（负责人可在成员管理中分配；[MOCK-ONLY] 缺口 §7.1-17） */
export const ENTERPRISE_PERMISSIONS: { value: EnterpriseMemberPermission; label: string; desc: string }[] = [
  { value: 'publish_demand', label: '发布需求', desc: '可代替企业发布项目/需求' },
  { value: 'respond_demand', label: '响应需求', desc: '可代替企业响应他人需求' },
  { value: 'space_reserve', label: '空间预约', desc: '可代替企业预约会议室等空间' },
  { value: 'article_submit', label: '文章投稿', desc: '可代替企业提交投稿' },
  { value: 'manage_members', label: '管理成员', desc: '可修改成员职位、手机号与移除成员' },
  { value: 'invite_member', label: '邀请成员', desc: '可向他人发送企业邀请' },
  { value: 'assign_permission', label: '分配权限', desc: '可为其他成员分配权限' },
  { value: 'edit_card', label: '编辑企业名片', desc: '可编辑企业基本信息与名片' },
]

export const ENTERPRISE_PERMISSION_KEYS = ENTERPRISE_PERMISSIONS.map((p) => p.value)
