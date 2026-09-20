import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HotEventStrip from './HotEventStrip.vue'

const stubs = {
  EmptyBlock: { props: ['text'], template: '<div class="empty-stub">{{ text }}</div>' },
  RouterLink: { template: '<a><slot /></a>' },
  TIcon: true,
  TTag: { template: '<span><slot /></span>' },
}

describe('HotEventStrip', () => {
  it('使用近期活动标题和匹配的空状态文案', () => {
    const wrapper = mount(HotEventStrip, {
      props: { events: [] },
      global: { stubs },
    })

    expect(wrapper.get('h2').text()).toBe('近期活动')
    expect(wrapper.get('.empty-stub').text()).toBe('暂无近期活动')
    expect(wrapper.text()).not.toContain('进行中活动')
  })
})
