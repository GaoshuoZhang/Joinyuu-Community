import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivationChecklist from './ActivationChecklist.vue'

const stubs = {
  TCollapse: { template: '<div><slot /></div>' },
  TCollapsePanel: {
    template: '<div><slot name="header" /><slot name="header-right-content" /><slot /></div>',
  },
  TButton: {
    emits: ['click'],
    template: '<button type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  TDialog: {
    props: ['visible'],
    emits: ['confirm'],
    template: '<div v-if="visible" role="dialog"><button class="confirm-dismiss" @click="$emit(\'confirm\')">确认隐藏</button></div>',
  },
  TIcon: true,
  RouterLink: { template: '<a><slot /></a>' },
}

describe('ActivationChecklist', () => {
  it('默认展开，并支持键盘可达的折叠按钮', async () => {
    const wrapper = mount(ActivationChecklist, {
      props: { steps: [{ key: 'realname', label: '完成实名认证', done: false, path: '/me/realname' }] },
      global: { stubs },
    })

    const toggle = wrapper.get('.activation-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-controls')).toBe('activation-checklist-content')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('永久隐藏需确认后才派发 dismiss', async () => {
    const wrapper = mount(ActivationChecklist, {
      props: { steps: [] },
      global: { stubs },
    })

    await wrapper.get('.activation-hide').trigger('click')
    expect(wrapper.emitted('dismiss')).toBeUndefined()
    expect(wrapper.get('[role="dialog"]').text()).toContain('确认隐藏')

    await wrapper.get('.confirm-dismiss').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
