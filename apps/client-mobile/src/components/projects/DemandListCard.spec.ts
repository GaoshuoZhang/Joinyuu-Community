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
  responseCount: 1,
  visibilityIdentities: [],
  visibilityLevels: [],
  createdAt: '2026-10-15',
}

describe('DemandListCard', () => {
  it('places the responded marker immediately after the title', () => {
    const wrapper = mount(DemandListCard, {
      props: { demand, responded: true, to: '/demands/demand-1' },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          TTag: { template: '<span><slot /></span>' },
          IdentityTag: true,
          StateTag: { template: '<span class="response-tag">已响应</span>' },
        },
      },
    })

    const title = wrapper.get('.d-title')
    const tag = wrapper.get('.response-tag')
    expect(title.element.parentElement).toBe(tag.element.parentElement)
    expect(title.element.compareDocumentPosition(tag.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
