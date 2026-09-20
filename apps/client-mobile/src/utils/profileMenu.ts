export interface ProfileMenuEntry {
  path: string
  label: string
  note: string
}

/** 「我的」页「更多」分组：人才登记仅向非社区个体用户展示。 */
export function buildProfileMoreEntries(hasCommunityIndividual: boolean, unread: number): ProfileMenuEntry[] {
  const entries: ProfileMenuEntry[] = [
    { path: '/me/records', label: '我的记录', note: '需求 / 报名 / 订单等' },
    { path: '/me/settings', label: '设置', note: '资料 / 地址 / 账号安全' },
    { path: '/notices', label: '站内信', note: unread > 0 ? `${unread} 条未读` : '' },
  ]
  if (!hasCommunityIndividual) {
    entries.unshift({ path: '/intros/talent', label: '人才登记', note: '提交申请，加入社区人才库' })
  }
  return entries
}
