import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeBanner from './HomeBanner.vue'

const banners = [
  { id: 'banner-1', title: '首图', subtitle: '首图说明', imageUrl: '/first.jpg' },
  { id: 'banner-2', title: '后续图', subtitle: '后续说明', imageUrl: '/later.jpg' },
  { id: 'banner-3', title: '文字横幅', subtitle: '没有图片' },
]

const stubs = {
  TSwiper: { template: '<div class="swiper-stub"><slot /></div>' },
  TSwiperItem: { template: '<div><slot /></div>' },
  TIcon: true,
}

const directives = { pressable: {} }

describe('HomeBanner', () => {
  it('优先加载首图并延迟加载后续图片', () => {
    const wrapper = mount(HomeBanner, {
      props: { banners: [banners[2], banners[0], banners[1]] },
      global: { stubs, directives },
    })

    const images = wrapper.findAll('img')
    expect(images[0].attributes('loading')).toBe('eager')
    expect(images[0].attributes('fetchpriority')).toBe('high')
    expect(images[1].attributes('loading')).toBe('lazy')
    expect(images[1].attributes('fetchpriority')).toBe('auto')
    expect(wrapper.text()).toContain('文字横幅')
  })

  it('图片失败时展示明确占位且保留横幅文字', async () => {
    const wrapper = mount(HomeBanner, {
      props: { banners },
      global: { stubs, directives },
    })

    await wrapper.findAll('img')[0].trigger('error')
    expect(wrapper.text()).toContain('图片暂不可用')
    expect(wrapper.text()).toContain('首图')
    expect(wrapper.text()).toContain('首图说明')
  })

  it('横幅使用固定高度并通过原生按钮派发选择事件', async () => {
    const wrapper = mount(HomeBanner, {
      props: { banners },
      global: { stubs, directives },
    })

    expect(wrapper.get('.banner').attributes('style')).toContain('--home-banner-height: 130px')
    await wrapper.findAll('.banner-card')[1].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[1]])
  })
})
