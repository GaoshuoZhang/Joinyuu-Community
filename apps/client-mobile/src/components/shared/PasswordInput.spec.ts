import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PasswordInput from './PasswordInput.vue'

describe('密码显隐', () => {
  it('通过具名按钮切换原生输入类型并保留内容和自动填充属性', async () => {
    const wrapper = mount(PasswordInput, { props: { modelValue: 'test-pass' }, attrs: { autocomplete: 'current-password' } })
    const button = wrapper.get('button')
    expect(button.attributes('aria-label')).toBe('显示密码')
    expect(wrapper.get('input').attributes('type')).toBe('password')
    await button.trigger('click')
    expect(button.attributes('aria-label')).toBe('隐藏密码')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('input').attributes('type')).toBe('text')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('test-pass')
    expect(wrapper.get('input').attributes('autocomplete')).toBe('current-password')
    wrapper.unmount()
  })
})
