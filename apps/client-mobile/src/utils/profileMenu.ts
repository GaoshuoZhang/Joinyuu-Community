import type { THEME_ENTRY_KEYS } from '@/utils/customerTheme'

/** 首页入口色键：宫格图标底色/图标色取自主题的 entryCards（与首页快捷卡片同源） */
export type ProfileMenuColorKey = typeof THEME_ENTRY_KEYS[number]

export interface ProfileMenuEntry {
  path: string
  label: string
  /** TDesign 图标名（宫格 icon 展示） */
  icon: string
  /** 宫格配色键（缺省 = 沿用页面默认强调色，仅用于无对应入口色系的入口） */
  themeKey?: ProfileMenuColorKey
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

/** 服务分区：次标题 + 该区宫格；无标题分区用于「身份与名片」（首区）与「设置」（末区） */
export interface ProfileMenuSection {
  title?: string
  /** 无标题分区的无障碍区域名（有标题时以标题为准） */
  ariaLabel?: string
  entries: ProfileMenuEntry[]
}

export interface ProfileMenuLayout {
  stats: ProfileStat[]
  /** 按用途分区（我参与的协作 / 我持有的权益与合同 / 我发起的申请与预约 / 我的内容与足迹） */
  sections: ProfileMenuSection[]
}

interface ProfileMenuContext {
  hasCommunityIndividual: boolean
  points: number
  levelLabel: string
  levelFailed: boolean
  /** 空间预约开关关闭时隐藏「空间预约」入口（工位租约无开关，常显） */
  reservationOpen: boolean
}

/** 「我的」页布局（参考支付宝分组）：账户数据卡 + 按用途分区的服务宫格。
 * 站内信由页头铃铛承载故不再重复入口；详细业务记录继续由二级页收纳。 */
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

  const sections: ProfileMenuSection[] = [
    /* 订单与租约紧随名片（同为「我的资产」语义），不再单设「资产与租约」分区。
     * 每项挂 themeKey：宫格图标沿用首页快捷卡片的色系（同一行内不重复），
     * 使各入口颜色不同、与首页视觉语言一致。 */
    {
      ariaLabel: '身份与名片',
      entries: [
        { path: '/me/identities', label: '关联身份', icon: 'usergroup', themeKey: 'enterprise' },
        context.hasCommunityIndividual
          ? { path: '/me/cards/individual', label: '我的名片', icon: 'user', themeKey: 'talent' }
          : { path: '/intros/talent', label: '人才登记', icon: 'user', themeKey: 'talent' },
        { path: '/me/orders', label: '我的订单', icon: 'order', themeKey: 'mall' },
        { path: '/me/leases', label: '工位租约', icon: 'building', themeKey: 'spaces' },
      ],
    },
    {
      title: '项目与需求',
      entries: [
        { path: '/me/projects', label: '我的项目', icon: 'app', themeKey: 'events' },
        { path: '/me/demands', label: '我的需求', icon: 'file', themeKey: 'articles' },
        { path: '/me/responses', label: '我的响应', icon: 'chat', themeKey: 'mall' },
      ],
    },
    {
      title: '申请与预约',
      entries: [
        { path: '/me/applications', label: '申请记录', icon: 'file-add', themeKey: 'enterprise' },
        { path: '/me/enrollments', label: '活动报名', icon: 'calendar', themeKey: 'events' },
        ...(context.reservationOpen
          ? [{ path: '/me/reservations', label: '空间预约', icon: 'location', themeKey: 'spaces' as const }]
          : []),
      ],
    },
    {
      title: '内容与足迹',
      entries: [
        { path: '/me/messages', label: '提交留言', icon: 'mail', themeKey: 'talent' },
        { path: '/me/articles', label: '投稿记录', icon: 'article', themeKey: 'articles' },
        { path: '/me/favorites', label: '收藏内容', icon: 'star', themeKey: 'mall' },
        { path: '/me/history', label: '浏览历史', icon: 'history', themeKey: 'spaces' },
      ],
    },
  ]

  return { stats, sections }
}