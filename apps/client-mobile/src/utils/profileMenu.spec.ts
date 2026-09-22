import { describe, expect, it } from 'vitest'
import { buildProfileMenuSections } from './profileMenu'

describe('profile menu sections', () => {
  it('groups a regular user menu by task and offers talent registration', () => {
    const sections = buildProfileMenuSections({
      hasCommunityIndividual: false,
      identityCount: 0,
      pointsLabel: '120 分',
      levelLabel: '',
      levelFailed: false,
      unread: 0,
    })

    expect(sections.map((section) => section.title)).toEqual(['身份与名片', '我的服务', '账户与权益', '消息与设置'])
    expect(sections[0]?.entries.map((entry) => entry.path)).toEqual(['/me/identities', '/intros/talent'])
    expect(sections[1]?.entries.map((entry) => entry.path)).toEqual(['/me/records', '/me/orders'])
    expect(sections[2]?.entries.map((entry) => entry.path)).toEqual(['/me/points'])
  })

  it('shows card and level entries for community individuals', () => {
    const sections = buildProfileMenuSections({
      hasCommunityIndividual: true,
      identityCount: 2,
      pointsLabel: '1,200 分',
      levelLabel: 'Lv.3 共创者',
      levelFailed: false,
      unread: 2,
    })
    const entries = sections.flatMap((section) => section.entries)

    expect(entries.find((entry) => entry.path === '/me/identities')?.note).toBe('2 个')
    expect(entries.some((entry) => entry.path === '/me/cards/individual')).toBe(true)
    expect(entries.some((entry) => entry.path === '/intros/talent')).toBe(false)
    expect(entries.find((entry) => entry.path === '/me/experience')?.note).toBe('Lv.3 共创者')
    expect(entries.find((entry) => entry.path === '/notices')?.note).toBe('2 条未读')
  })

  it('turns a failed level entry into a retry action', () => {
    const sections = buildProfileMenuSections({
      hasCommunityIndividual: true,
      identityCount: 1,
      pointsLabel: '0 分',
      levelLabel: '',
      levelFailed: true,
      unread: 0,
    })
    const level = sections.flatMap((section) => section.entries).find((entry) => entry.path === '/me/experience')

    expect(level).toMatchObject({ action: 'retry-level', note: '加载失败，点击重试' })
  })
})
