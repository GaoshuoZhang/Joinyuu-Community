import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FlowResult from './FlowResult.vue'

describe('FlowResult', () => {
  it('renders the persistent result and emits both navigation actions', async () => {
    const wrapper = mount(FlowResult, {
      props: {
        title: '报名成功',
        description: '可在我的报名中查看活动安排。',
        reference: 'EV6001',
        primaryText: '查看我的报名',
        secondaryText: '返回活动列表',
      },
    })

    expect(wrapper.text()).toContain('报名成功')
    expect(wrapper.text()).toContain('业务编号：EV6001')

    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('primary')).toHaveLength(1)
    expect(wrapper.emitted('secondary')).toHaveLength(1)
  })
})
