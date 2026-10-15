import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import BrandHero from './BrandHero.vue'

describe('BrandHero theme content', () => {
  it('renders the customer headline as text with one emphasized phrase', () => {
    const wrapper = mount(BrandHero, { props: { siteName: '公版', brand: { name: '客户', eyebrow: 'Community', headline: 'AI创业者的伟大航路', highlight: '伟大航路', slogan: '一起启航', logo: '/logo.png', logoDark: '/logo-dark.png', logoShape: 'wordmark' } } })
    expect(wrapper.get('h2').text()).toBe('AI创业者的伟大航路')
    expect(wrapper.get('.brand-hero-highlight').text()).toBe('伟大航路')
    expect(wrapper.findAll('img').map((image) => image.attributes('src'))).toEqual(['/logo.png', '/logo-dark.png'])
    expect(wrapper.find('.customer-brand-logo--wordmark').exists()).toBe(true)
    expect(wrapper.find('.brand-hero-copy').exists()).toBe(false)
  })
  it('keeps untrusted markup literal and supports old themes without a headline', () => {
    const wrapper = mount(BrandHero, { props: { siteName: '公版', brand: { headline: '<img src=x onerror=alert(1)>', highlight: '<img' } } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('h2').text()).toBe('<img src=x onerror=alert(1)>')
    const legacy = mount(BrandHero, { props: { siteName: '公版', brand: { name: '客户' } } })
    expect(legacy.get('h2').text()).toBe('客户')
    expect(legacy.find('.brand-hero--headline').exists()).toBe(false)
  })
})
