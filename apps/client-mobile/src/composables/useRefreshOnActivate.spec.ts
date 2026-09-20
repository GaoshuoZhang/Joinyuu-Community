import { defineComponent, h, KeepAlive, nextTick, onMounted } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import { useRefreshOnActivate } from './useRefreshOnActivate'

describe('useRefreshOnActivate', () => {
  it('首次挂载不重复刷新，KeepAlive 再激活时刷新', async () => {
    const mounted = vi.fn()
    const refreshed = vi.fn()
    const Cached = defineComponent({
      name: 'CachedRefreshView',
      setup() {
        onMounted(mounted)
        useRefreshOnActivate(refreshed)
        return () => h('div', 'cached')
      },
    })
    const Other = defineComponent({ name: 'OtherRefreshView', setup: () => () => h('div', 'other') })
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

    await router.push('/cached')
    await router.isReady()
    const wrapper = mount(Root, { global: { plugins: [router] } })
    await nextTick()
    expect(mounted).toHaveBeenCalledOnce()
    expect(refreshed).not.toHaveBeenCalled()

    await router.push('/other')
    await router.push('/cached')
    await nextTick()
    expect(mounted).toHaveBeenCalledOnce()
    expect(refreshed).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
