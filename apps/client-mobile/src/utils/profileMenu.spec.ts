import { describe, expect, it } from 'vitest'
import { buildProfileMenuLayout } from './profileMenu'

const base = {
  points: 120,
  levelLabel: '',
  levelFailed: false,
  reservationOpen: true,
}

describe('profile menu layout', () => {
  it('regular user: points-only stats, identity zone with talent registration', () => {
    const { stats, sections } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: false })

    expect(stats.map((s) => s.key)).toEqual(['points'])
    expect(stats[0]).toMatchObject({ path: '/me/points', value: '120' })

    /* 首区（身份与名片，无标题）与末区（设置，无标题）不显示次标题 */
    expect(sections[0]).toMatchObject({ ariaLabel: '身份与名片' })
    expect(sections.at(-1)).toMatchObject({ ariaLabel: '设置' })
    expect(sections[0].entries.map((entry) => entry.path)).toEqual(['/me/identities', '/intros/talent'])
    expect(sections.at(-1)?.entries.map((entry) => entry.path)).toEqual(['/me/settings'])

    /* 分区标题与顺序 */
    expect(sections.filter((section) => section.title).map((section) => section.title)).toEqual([
      '项目与需求',
      '资产与租约',
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
    expect(identity).toEqual(['/me/identities', '/me/cards/individual'])
  })

  it('entry inventory: 项目与需求 / 资产与租约 / 申请与预约 / 内容与足迹', () => {
    const { sections } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: true })
    const zone = (title: string) => sections.find((section) => section.title === title)?.entries.map((entry) => entry.path)

    expect(zone('项目与需求')).toEqual(['/me/projects', '/me/demands', '/me/responses'])
    expect(zone('资产与租约')).toEqual(['/me/orders', '/me/leases'])
    expect(zone('申请与预约')).toEqual(['/me/applications', '/me/enrollments', '/me/reservations'])
    expect(zone('内容与足迹')).toEqual(['/me/messages', '/me/articles', '/me/favorites', '/me/history'])

    const all = sections.flatMap((section) => section.entries).map((entry) => entry.path)
    /* 站内信由页头铃铛承载、我的记录已被各分区覆盖，均不再占宫格入口 */
    expect(all).not.toContain('/notices')
    expect(all).not.toContain('/me/records')
  })

  it('reservation switch off: hides 空间预约 but keeps 工位租约（租约无开关）', () => {
    const { sections } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: true, reservationOpen: false })

    expect(sections.find((section) => section.title === '申请与预约')?.entries.map((entry) => entry.path)).toEqual([
      '/me/applications',
      '/me/enrollments',
    ])
    expect(sections.find((section) => section.title === '资产与租约')?.entries.map((entry) => entry.path)).toEqual([
      '/me/orders',
      '/me/leases',
    ])
  })

  it('failed level stat is flagged for retry', () => {
    const { stats } = buildProfileMenuLayout({ ...base, hasCommunityIndividual: true, points: 0, levelFailed: true })

    const level = stats.find((s) => s.key === 'level')
    expect(level).toMatchObject({ failed: true, value: '' })
  })
})