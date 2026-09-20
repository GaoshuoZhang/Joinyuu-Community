import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EnterpriseCardItem from './EnterpriseCardItem.vue'
import type { EnterpriseRecord } from '@/types'

const enterprise: EnterpriseRecord = {
  id: 'E001',
  name: '星河科技',
  logo: '/logos/xinghe.png',
  industry: '人工智能',
  size: '20-99人',
  description: '提供企业数字化服务',
  members: [],
}

const stubs = {
  TAvatar: {
    props: ['image', 'shape', 'size'],
    template: '<div class="avatar-stub" :data-image="image" :data-shape="shape" :data-size="size"><slot /></div>',
  },
  TTag: { template: '<span><slot /></span>' },
}

describe('EnterpriseCardItem', () => {
  it('向企业头像传入 Logo，并保留名称首字作为回退内容', () => {
    const wrapper = mount(EnterpriseCardItem, {
      props: { enterprise },
      global: { stubs, directives: { pressable: {} } },
    })

    const avatar = wrapper.get('.avatar-stub')
    expect(avatar.attributes('data-image')).toBe('/logos/xinghe.png')
    expect(avatar.attributes('data-shape')).toBe('round')
    expect(avatar.text()).toBe('星')
  })

  it('Logo 缺失时仍展示名称首字回退', () => {
    const wrapper = mount(EnterpriseCardItem, {
      props: { enterprise: { ...enterprise, logo: undefined } },
      global: { stubs, directives: { pressable: {} } },
    })

    const avatar = wrapper.get('.avatar-stub')
    expect(avatar.attributes('data-image')).toBeUndefined()
    expect(avatar.text()).toBe('星')
  })
})
