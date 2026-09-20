import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CaptchaField from './CaptchaField.vue'

describe('CaptchaField', () => {
  it('渲染标签、验证码图片与错误信息', () => {
    const wrapper = mount(CaptchaField, {
      props: { modelValue: '', image: 'data:image/png;base64,xxx', label: '图形验证码', error: '请输入验证码' },
    })
    expect(wrapper.text()).toContain('图形验证码')
    expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,xxx')
    expect(wrapper.text()).toContain('请输入验证码')
  })

  it('点击刷新派发 refresh，输入派发 update:modelValue', async () => {
    const wrapper = mount(CaptchaField, { props: { modelValue: '' } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)

    await wrapper.get('input').setValue('1234')
    const updates = wrapper.emitted('update:modelValue')
    expect(updates?.at(-1)).toEqual(['1234'])
  })
})
