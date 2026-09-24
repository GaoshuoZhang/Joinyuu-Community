import { describe, expect, it } from 'vitest'
import { buildProfileMenuLayout } from './profileMenu'

describe('profile menu layout', () => {
  it('regular user: points-only stats and talent registration entry', () => {
    const { stats, grid } = buildProfileMenuLayout({
      hasCommunityIndividual: false,
      points: 120,
      levelLabel: '',
      levelFailed: false,
      unread: 0,
    })

    expect(stats.map((s) => s.key)).toEqual(['points'])
    expect(stats[0]).toMatchObject({ path: '/me/points', value: '120' })
    expect(grid.map((entry) => entry.path)).toEqual([
      '/me/identities',
      '/intros/talent',
      '/me/records',
      '/me/orders',
      '/notices',
      '/me/messages',
      '/me/settings',
    ])
    expect(grid.every((entry) => Boolean(entry.icon))).toBe(true)
  })

  it('community individual: level stat and card entry with unread badge', () => {
    const { stats, grid } = buildProfileMenuLayout({
      hasCommunityIndividual: true,
      points: 1200,
      levelLabel: 'Lv.3 共创者',
      levelFailed: false,
      unread: 2,
    })

    expect(stats.map((s) => s.key)).toEqual(['points', 'level'])
    expect(stats[1]).toMatchObject({ path: '/me/experience', value: 'Lv.3 共创者', failed: false })
    expect(grid.some((entry) => entry.path === '/me/cards/individual')).toBe(true)
    expect(grid.some((entry) => entry.path === '/intros/talent')).toBe(false)
    expect(grid.find((entry) => entry.path === '/notices')?.badge).toBe(2)
  })

  it('failed level stat is flagged for retry', () => {
    const { stats } = buildProfileMenuLayout({
      hasCommunityIndividual: true,
      points: 0,
      levelLabel: '',
      levelFailed: true,
      unread: 0,
    })

    const level = stats.find((s) => s.key === 'level')
    expect(level).toMatchObject({ failed: true, value: '' })
  })
})
