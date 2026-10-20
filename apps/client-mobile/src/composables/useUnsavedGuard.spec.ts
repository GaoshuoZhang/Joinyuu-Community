import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { RouterView, createMemoryHistory, createRouter } from 'vue-router'
import { useUnsavedGuard } from './useUnsavedGuard'

/* 回归：已登录用户在「找回密码」页点「返回登录」时，/login 是 guestOnly，
 * 守卫会把导航重定向到首页；vue-router 会为**重定向后的新目标**再跑一次本组件的
 * beforeRouteLeave。若「已确认离开」的状态没有在整条重定向链路上保持，就会连续弹两道
 * 「离开当前页面？」。这里锁定：一条导航链路上只弹一次。 */
const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }))

vi.mock('@/utils/confirmDialog', () => ({
  confirmDialog: (options: { onConfirm?: () => void; onCancel?: () => void }) => {
    confirmMock(options)
    return { destroy: vi.fn() }
  },
}))

function formComponent(isDirty: () => boolean) {
  return defineComponent({
    setup() {
      useUnsavedGuard(isDirty)
      return () => h('div', 'form')
    },
  })
}

const Blank = defineComponent({ setup: () => () => h('div', 'blank') })

/** redirectLogin=true 模拟真实守卫：已登录访问 guestOnly 的 /login → 重定向首页 */
async function setup(options: { dirty: boolean; redirectLogin: boolean }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/form', component: formComponent(() => options.dirty) },
      { path: '/login', component: Blank },
      { path: '/', component: Blank },
    ],
  })
  if (options.redirectLogin) {
    router.beforeEach((to) => (to.path === '/login' ? { path: '/' } : true))
  }
  mount(defineComponent({ setup: () => () => h(RouterView) }), { global: { plugins: [router] } })
  await router.push('/form')
  await router.isReady()
  await flushPromises()
  return router
}

describe('useUnsavedGuard', () => {
  beforeEach(() => confirmMock.mockReset())

  it('重定向链路只询问一次，并完成到重定向目标的导航', async () => {
    const router = await setup({ dirty: true, redirectLogin: true })
    const navigation = router.push('/login')
    await flushPromises()

    expect(confirmMock).toHaveBeenCalledTimes(1)
    confirmMock.mock.calls[0][0].onConfirm()
    await navigation
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
    /* 关键断言：重定向后的新目标不再弹第二道 */
    expect(confirmMock).toHaveBeenCalledTimes(1)
  })

  it('取消后留在本页，未保存内容仍在时下一次离开继续询问', async () => {
    const router = await setup({ dirty: true, redirectLogin: false })
    const first = router.push('/login')
    await flushPromises()
    confirmMock.mock.calls[0][0].onCancel()
    await first
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/form')
    expect(confirmMock).toHaveBeenCalledTimes(1)

    const second = router.push('/login')
    await flushPromises()
    expect(confirmMock).toHaveBeenCalledTimes(2)
    confirmMock.mock.calls[1][0].onConfirm()
    await second
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('无未保存内容时直接放行，不弹窗', async () => {
    const router = await setup({ dirty: false, redirectLogin: false })
    await router.push('/login')
    await flushPromises()

    expect(confirmMock).not.toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
