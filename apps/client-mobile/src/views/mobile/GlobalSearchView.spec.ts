import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import GlobalSearchView from './GlobalSearchView.vue'

vi.mock('@/api/demands', () => ({ fetchDemands: vi.fn().mockResolvedValue({
  total: 31, list: [{ id: 'D1', title: '设计需求', description: '设计' }],
}) }))
vi.mock('@/api/events', () => ({ fetchEvents: vi.fn().mockResolvedValue({
  total: 21, list: [{ id: 'EV1', title: '设计活动', startTime: '2026-10-20 12:00', location: '社区' }],
}) }))
vi.mock('@/api/contents', () => ({ fetchArticles: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/community', () => ({ fetchEnterpriseList: vi.fn().mockResolvedValue([]), fetchPolicies: vi.fn().mockResolvedValue([]), fetchTalents: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/spaces', () => ({ fetchSpaces: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/analytics', () => ({ trackEvent: vi.fn().mockResolvedValue(undefined) }))

describe('全局搜索上下文', () => {
  it('提供携带关键词的更多结果入口，清空后移除路由关键词和旧结果', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/search', component: GlobalSearchView }, { path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/search?q=设计')
    await router.isReady()
    const root = mount(RouterView, { global: { plugins: [router] } })
    await flushPromises()
    expect(root.get('a[href^="/projects?"]').attributes('href')).toBe('/projects?q=%E8%AE%BE%E8%AE%A1')
    expect(root.get('a[href^="/plaza?"]').attributes('href')).toBe('/plaza?tab=events&q=%E8%AE%BE%E8%AE%A1')
    await root.get('input').setValue('')
    await flushPromises()
    expect(router.currentRoute.value.query.q).toBeUndefined()
    expect(root.findAll('.result-list a')).toHaveLength(0)
    expect(root.find('.more-results').exists()).toBe(false)
    root.unmount()
  })
})
