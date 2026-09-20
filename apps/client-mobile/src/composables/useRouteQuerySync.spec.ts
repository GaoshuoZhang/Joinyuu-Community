import { defineComponent, h, KeepAlive, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { useRouteQuerySync } from './useRouteQuerySync'

describe('useRouteQuerySync', () => {
  it('同步 query，并在 KeepAlive 再激活时恢复最新地址状态', async () => {
    const seen: string[] = []
    const Cached = defineComponent({
      name: 'CachedQueryView',
      setup() {
        useRouteQuerySync('/cached', (query) => seen.push(query.q ?? ''))
        return () => h('div', 'cached')
      },
    })
    const Other = defineComponent({ name: 'OtherView', setup: () => () => h('div', 'other') })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/cached', component: Cached },
        { path: '/other', component: Other },
      ],
    })
    const Root = defineComponent({
      setup: () => () => h(RouterView, null, {
        default: ({ Component }: { Component: object }) => h(KeepAlive, null, [h(Component)]),
      }),
    })

    await router.push('/cached?q=one')
    await router.isReady()
    const wrapper = mount(Root, { global: { plugins: [router] } })
    await nextTick()
    expect(seen.at(-1)).toBe('one')

    await router.push('/cached?q=two')
    await nextTick()
    expect(seen.at(-1)).toBe('two')

    await router.push('/other')
    await router.push('/cached?q=three')
    await nextTick()
    expect(seen.at(-1)).toBe('three')
    wrapper.unmount()
  })
})
