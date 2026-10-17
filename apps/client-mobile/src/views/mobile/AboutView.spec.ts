import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter, RouterLink } from 'vue-router'
import AboutView from './AboutView.vue'
import { useConfigStore } from '@/stores/config'
import { useCustomerThemeStore } from '@/stores/customerTheme'
import { APP_VERSION } from '@/version'
import type { CustomerTheme } from '@/utils/customerTheme'

/* 用内存路由渲染真实的 router-link（断言协议入口的目标地址） */
async function setup() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/privacy', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const pinia = createPinia()
  const wrapper = mount(AboutView, { global: { plugins: [pinia, router], components: { RouterLink } } })
  return { wrapper, config: useConfigStore(pinia), theme: useCustomerThemeStore(pinia) }
}

describe('关于页', () => {
  it('展示主题中的客户品牌信息与开发者联系方式', async () => {
    const { wrapper, theme } = await setup()
    const payload: CustomerTheme = {
      packageId: 'package-opiece',
      schemaVersion: 1,
      id: 'opiece',
      name: 'OPiece 主题',
      version: '1.2.0',
      brand: { name: 'OPiece 社区', slogan: 'AI 创业者的伟大航路', logo: 'data:image/png;base64,AAAA', logoShape: 'wordmark' },
    }
    theme.theme = payload
    await nextTick()

    expect(wrapper.get('.brand-name').text()).toBe('OPiece 社区')
    expect(wrapper.get('.slogan').text()).toBe('AI 创业者的伟大航路')
    expect(wrapper.get('.theme-version').text()).toBe('定制UI版本号 v1.2.0')
    expect(wrapper.get('.brand-logo img').attributes('src')).toBe('data:image/png;base64,AAAA')
    expect(wrapper.find('.logo-glyph').exists()).toBe(false)
    expect(wrapper.get('.sec-title').text()).toBe('开发者')
    wrapper.unmount()
  })

  it('无主题时回退站点名与字标，并给出联系方式与协议入口', async () => {
    const { wrapper, config } = await setup()
    config.config = { ...config.config, siteName: '测试社区', siteSlogan: '测试口号', version: '1.5.0' }
    await nextTick()

    expect(wrapper.get('.logo-glyph').text()).toBe('聚')
    expect(wrapper.get('.brand-name').text()).toBe('测试社区')
    expect(wrapper.get('.slogan').text()).toBe('测试口号')
    expect(wrapper.find('.theme-version').exists()).toBe(false)
    /* 版本信息：软件版本取构建期常量，服务端版本取站点配置下发值 */
    expect(wrapper.get('.app-version').text()).toBe(`软件版本 v${APP_VERSION}`)
    expect(wrapper.get('.server-version').text()).toBe('服务端版本 v1.5.0')

    expect(wrapper.findAll('.ext').map((link) => link.attributes('href'))).toEqual([
      'https://github.com/GaoshuoZhang',
      'mailto:gaoshuo.zhang@qq.com',
    ])
    const github = wrapper.get('a[href="https://github.com/GaoshuoZhang"]')
    expect(github.attributes('target')).toBe('_blank')
    expect(github.attributes('rel')).toBe('noopener')
    expect(wrapper.get('a[href="/privacy"]').text()).toContain('用户协议与隐私政策')
    wrapper.unmount()
  })
})
