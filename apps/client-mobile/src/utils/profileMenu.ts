export interface ProfileMenuEntry {
  path: string
  label: string
  note?: string
  emphasis?: boolean
  action?: 'retry-level'
}

export interface ProfileMenuSection {
  title: string
  entries: ProfileMenuEntry[]
}

interface ProfileMenuContext {
  hasCommunityIndividual: boolean
  identityCount: number
  pointsLabel: string
  levelLabel: string
  levelFailed: boolean
  unread: number
}

/** 「我的」页入口按用户任务归类；身份相关入口随社区个体身份变化。 */
export function buildProfileMenuSections(context: ProfileMenuContext): ProfileMenuSection[] {
  const identityEntries: ProfileMenuEntry[] = [
    {
      path: '/me/identities',
      label: '关联身份',
      note: context.identityCount > 0 ? `${context.identityCount} 个` : undefined,
    },
  ]

  if (context.hasCommunityIndividual) {
    identityEntries.push({ path: '/me/cards/individual', label: '我的名片', note: '维护对外展示资料' })
  } else {
    identityEntries.push({ path: '/intros/talent', label: '人才登记', note: '申请加入社区人才库' })
  }

  const accountEntries: ProfileMenuEntry[] = [
    { path: '/me/points', label: '我的积分', note: context.pointsLabel, emphasis: true },
  ]
  if (context.hasCommunityIndividual) {
    accountEntries.push({
      path: '/me/experience',
      label: '我的等级',
      note: context.levelFailed ? '加载失败，点击重试' : context.levelLabel || '未绑定',
      emphasis: Boolean(context.levelLabel),
      action: context.levelFailed ? 'retry-level' : undefined,
    })
  }

  return [
    { title: '身份与名片', entries: identityEntries },
    {
      title: '我的服务',
      entries: [
        { path: '/me/records', label: '我的记录', note: '项目 / 需求 / 报名 / 场地' },
        { path: '/me/orders', label: '我的订单', note: '券码 / 物流 / 评价' },
      ],
    },
    { title: '账户与权益', entries: accountEntries },
    {
      title: '消息与设置',
      entries: [
        { path: '/notices', label: '站内信', note: context.unread > 0 ? `${context.unread} 条未读` : undefined },
        { path: '/me/messages', label: '我的留言', note: '向社区留言 / 查看回复' },
        { path: '/me/settings', label: '设置', note: '资料 / 地址 / 安全 / 通知' },
      ],
    },
  ]
}
