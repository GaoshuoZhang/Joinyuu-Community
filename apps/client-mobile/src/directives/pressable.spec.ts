import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { pressable } from './pressable'

describe('动态可操作行', () => {
  it('加载完成后启用键盘，重新禁用时清理事件和自动语义', async () => {
    const enabled = ref(false)
    const click = vi.fn()
    const wrapper = mount(defineComponent({
      directives: { pressable }, setup: () => ({ enabled, click }),
      template: '<div v-pressable="enabled" @click="click">操作</div>',
    }))
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    enabled.value = true
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('role')).toBe('button')
    await wrapper.trigger('keydown', { key: 'Enter' })
    expect(click).toHaveBeenCalledTimes(1)
    enabled.value = false
    await wrapper.vm.$nextTick()
    expect(wrapper.attributes('role')).toBeUndefined()
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    await wrapper.trigger('keydown', { key: 'Enter' })
    expect(click).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
