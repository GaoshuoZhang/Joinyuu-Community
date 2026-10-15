import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HotEventStrip from './HotEventStrip.vue'

const stubs = {
  RouterLink: { template: '<a><slot /></a>' },
  TIcon: true,
  TTag: { template: '<span><slot /></span>' },
}

describe('HotEventStrip', () => {
  it('没有活动时隐藏整个栏目', () => {
    const wrapper = mount(HotEventStrip, {
      props: { events: [] },
      global: { stubs },
    })

    expect(wrapper.find('section').exists()).toBe(false)
  })
})
