import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DemandListCard from './DemandListCard.vue'

const demand = {
  id: 'demand-1',
  title: '社区空间运营需求',
  description: '',
  categoryLabel: '空间服务',
  status: 'published' as const,
  publisherName: '社区运营方',
  publisherIdentity: 'official' as const,
  publisherIdentityLabel: '运营专员',
  responseCount: 1,
  visibilityIdentities: [],
  visibilityLevels: [],
  createdAt: '2026-10-15',
}

const stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  TTag: { template: '<span><slot /></span>' },
  StateTag: { template: '<span class="response-tag">已响应</span>' },
}

describe('DemandListCard', () => {
  it('renders the homepage feed card layout with responded marker in the head row', () => {
    const wrapper = mount(DemandListCard, {
      props: { demand, responded: true, to: '/demands/demand-1' },
      global: { stubs },
    })

    /* 首页同款三行结构：d-head（标签+响应数+标记）/ 标题独占一行 / d-meta（发布方·日期） */
    const head = wrapper.get('.d-head')
    const title = wrapper.get('.d-title')
    expect(title.element.parentElement).toBe(wrapper.element)
    expect(head.element.contains(title.element)).toBe(false)
    expect(head.get('.response-tag').text()).toBe('已响应')
    expect(head.text()).toContain('1 人响应')
  })

  it('shows the publisher as plain text instead of an identity tag', () => {
    const wrapper = mount(DemandListCard, {
      props: { demand, responded: false, to: '/demands/demand-1' },
      global: { stubs },
    })

    expect(wrapper.get('.d-pub').text()).toBe('发布者 社区运营方')
    /* 身份标签（IdentityTag）已移除：发布方行是纯文本，不带身份文案 */
    expect(wrapper.find('.d-pub').element.children).toHaveLength(0)
    expect(wrapper.text()).not.toContain('运营专员')
  })

  it('hides the response count when nobody responded', () => {
    const wrapper = mount(DemandListCard, {
      props: { demand: { ...demand, responseCount: 0 }, responded: false, to: '/demands/demand-1' },
      global: { stubs },
    })
    expect(wrapper.find('.d-tag-meta').exists()).toBe(false)
  })
})
