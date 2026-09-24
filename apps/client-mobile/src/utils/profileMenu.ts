export interface ProfileMenuEntry {
  path: string
  label: string
  /** TDesign 图标名（宫格 icon 展示） */
  icon: string
  /** 角标数值（如站内信未读数）；>0 时渲染 */
  badge?: number
  /** 特殊动作（不发路由）：如等级加载失败后点击重试 */
  action?: 'retry-level'
}

/** 顶部账户数据卡的两格（积分 / 等级） */
export interface ProfileStat {
  key: 'points' | 'level'
  path: string
  label: string
  value: string
  /** 等级格失败态：value 置空、点击重试 */
  failed?: boolean
}

export interface ProfileMenuLayout {
  stats: ProfileStat[]
  /** 服务宫格（压缩原「身份与名片 / 我的服务 / 消息与设置」三组列表为图标直达） */
  grid: ProfileMenuEntry[]
}

interface ProfileMenuContext {
  hasCommunityIndividual: boolean
  points: number
  levelLabel: string
  levelFailed: boolean
  unread: number
}

/** 「我的」页布局（参考支付宝）：账户数据卡 + 服务图标宫格，压缩一个层级。
 * 身份相关入口随社区个体身份变化；详细业务记录继续由二级页收纳。 */
export function buildProfileMenuLayout(context: ProfileMenuContext): ProfileMenuLayout {
  const stats: ProfileStat[] = [
    { key: 'points', path: '/me/points', label: '我的积分', value: `${context.points}` },
  ]
  if (context.hasCommunityIndividual) {
    stats.push({
      key: 'level',
      path: '/me/experience',
      label: '我的等级',
      value: context.levelFailed ? '' : context.levelLabel || '未绑定',
      failed: context.levelFailed,
    })
  }

  const grid: ProfileMenuEntry[] = [
    { path: '/me/identities', label: '关联身份', icon: 'usergroup' },
  ]
  if (context.hasCommunityIndividual) {
    grid.push({ path: '/me/cards/individual', label: '我的名片', icon: 'user' })
  } else {
    grid.push({ path: '/intros/talent', label: '人才登记', icon: 'user' })
  }
  grid.push(
    { path: '/me/records', label: '我的记录', icon: 'file' },
    { path: '/me/orders', label: '我的订单', icon: 'order' },
    { path: '/notices', label: '站内信', icon: 'notification', badge: context.unread },
    { path: '/me/messages', label: '我的留言', icon: 'chat' },
    { path: '/me/settings', label: '设置', icon: 'setting' },
  )

  return { stats, grid }
}
