import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeFeedSection from './HomeFeedSection.vue'

const stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  TTag: { template: '<span class="tag-stub"><slot /></span>' },
  EmptyBlock: true,
  TIcon: true,
}

describe('HomeFeedSection', () => {
  it('places the category and nonzero response count above the title', () => {
    const wrapper = mount(HomeFeedSection, {
      props: {
        title: '最新需求',
        items: [{
          key: 'demand-1',
          title: '联调-社区自建需求公开联系人',
          tag: '供应链',
          tagMeta: { text: '3 人响应', accent: true },
          path: '/demands/demand-1',
          metas: [{ text: '运营专员' }],
        }],
      },
      global: { stubs },
    })

    const card = wrapper.get('.demand-item')
    const category = card.get('.d-cat')
    const responseCount = card.get('.d-tag-meta')
    const title = card.get('.d-title')

    expect(category.text()).toBe('供应链')
    expect(responseCount.text()).toBe('3 人响应')
    expect(category.element.compareDocumentPosition(responseCount.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(responseCount.element.compareDocumentPosition(title.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('does not render a response count when no one has responded', () => {
    const wrapper = mount(HomeFeedSection, {
      props: {
        title: '最新需求',
        items: [{ key: 'demand-1', title: '需求标题', tag: '供应链', path: '/demands/demand-1', metas: [] }],
      },
      global: { stubs },
    })

    expect(wrapper.find('.d-tag-meta').exists()).toBe(false)
  })

  it('hides the whole section when there are no items', () => {
    const wrapper = mount(HomeFeedSection, {
      props: { title: '最新资讯', items: [] },
      global: { stubs },
    })

    expect(wrapper.find('section').exists()).toBe(false)
  })
})
