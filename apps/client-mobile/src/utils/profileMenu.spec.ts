import { describe, expect, it } from 'vitest'
import { buildProfileMenuLayout } from './profileMenu'

const base = {
  points: 120,
  levelLabel: '',
  levelFailed: false,
  reservationOpen: true,
}

describe('profile menu layout', () => {
  it('regular user: points-only stats, identity zone with talent registration and assets', () => {
    const { stats, sections } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: false })

    expect(stats.map((s) => s.key)).toEqual(['points'])
    expect(stats[0]).toMatchObject({ path: '/me/points', value: '120' })

    /* 首区（身份与名片，无标题）不显示次标题；订单与租约并入该区，不再单设「资产与租约」 */
    expect(sections[0]).toMatchObject({ ariaLabel: '身份与名片' })
    expect(sections[0].entries.map((entry) => entry.path)).toEqual([
      '/me/identities',
      '/intros/talent',
      '/me/orders',
      '/me/transactions',
      '/me/leases',
    ])

    /* 分区标题与顺序（页尾「设置」菜单由 MeView 承载，不在宫格布局内） */
    expect(sections.filter((section) => section.title).map((section) => section.title)).toEqual([
      '项目与需求',
      '申请与预约',
      '内容与足迹',
    ])
    expect(sections.flatMap((section) => section.entries).every((entry) => Boolean(entry.icon))).toBe(true)
  })

  it('community individual: level stat and personal card entry', () => {
    const { stats, sections } = buildProfileMenuLayout({
      ...base,
      hasCommunityIndividual: true,
      points: 1200,
      levelLabel: 'Lv.3 共创者',
    })

    expect(stats.map((s) => s.key)).toEqual(['points', 'level'])
    expect(stats[1]).toMatchObject({ path: '/me/experience', value: 'Lv.3 共创者', failed: false })

    const identity = sections[0].entries.map((entry) => entry.path)
    expect(identity).toEqual(['/me/identities', '/me/cards/individual', '/me/orders', '/me/transactions', '/me/leases'])
  })

  it('entry inventory: 项目与需求 / 申请与预约 / 内容与足迹', () => {
    const { sections } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: true })
    const zone = (title: string) => sections.find((section) => section.title === title)?.entries.map((entry) => entry.path)

    expect(zone('项目与需求')).toEqual(['/me/projects', '/me/demands', '/me/responses'])
    expect(zone('申请与预约')).toEqual(['/me/applications', '/me/enrollments', '/me/reservations'])
    expect(zone('内容与足迹')).toEqual(['/me/messages', '/me/articles', '/me/favorites', '/me/history'])

    const all = sections.flatMap((section) => section.entries).map((entry) => entry.path)
    /* 站内信由页头铃铛承载、我的记录已被各分区覆盖；设置菜单已迁到 MeView 页尾 */
    expect(all).not.toContain('/notices')
    expect(all).not.toContain('/me/records')
    expect(all).not.toContain('/me/settings')
  })

  it('reservation switch off: hides 空间预约 but keeps 工位租约（租约无开关）', () => {
    const { sections } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: true, reservationOpen: false })

    expect(sections.find((section) => section.title === '申请与预约')?.entries.map((entry) => entry.path)).toEqual([
      '/me/applications',
      '/me/enrollments',
    ])
    expect(sections[0].entries.map((entry) => entry.path)).toEqual([
      '/me/identities',
      '/me/cards/individual',
      '/me/orders',
      '/me/transactions',
      '/me/leases',
    ])
  })

  it('cash transaction and lease entries expose pending badges', () => {
    const { sections } = buildProfileMenuLayout({
      ...base,
      hasCommunityIndividual: false,
      pendingPayment: 2,
      refunding: 1,
      unpaidBills: 3,
    })
    const entries = sections[0].entries
    expect(entries.find((entry) => entry.path === '/me/transactions')?.badge).toBe(3)
    expect(entries.find((entry) => entry.path === '/me/leases')?.badge).toBe(3)
  })

  it('failed level stat is flagged for retry', () => {
    const { stats } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: true, points: 0, levelFailed: true })

    const level = stats.find((s) => s.key === 'level')
    expect(level).toMatchObject({ failed: true, value: '' })
  })
})
