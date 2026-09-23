import { beforeAll, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, reactive, type Reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import DemandRespondForm from './DemandRespondForm.vue'
import type { UserIdentity } from '@/types'

/* 组件内 useUnsavedGuard 依赖 vue-router 路由上下文（onBeforeRouteLeave 要求组件渲染在
 * 路由视图树内），测试通过 RouterView 挂载，再取子组件 wrapper 断言事件/expose。
 * props 用 reactive 承载，测试改其属性即可驱动子组件重渲染（等价 setProps）。 */
function mountInRouter(props: Record<string, unknown>) {
  const state = reactive(props)
  const View = defineComponent({
    setup: () => () => h(DemandRespondForm, state),
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: View },
      { path: '/other', component: { template: '<div/>' } },
    ],
  })
  return { router, state: state as Reactive<Record<string, unknown>> }
}

describe('DemandRespondForm', () => {
  beforeAll(() => {
    /* jsdom 未实现 scrollIntoView：t-form 的 scroll-to-first-error 在校验失败时依赖它 */
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {}
    }
  })

  async function mountForm(props: Record<string, unknown>) {
    const { router, state } = mountInRouter(props)
    await router.push('/')
    await router.isReady()
    const root = mount(RouterView, { global: { plugins: [router] } })
    return { wrapper: root.findComponent(DemandRespondForm), state }
  }

  it('空内容提交时不派发事件并展示行内错误', async () => {
    const { wrapper } = await mountForm({ identities: [], userName: '张三', submitting: false })
    /* t-form 经由 <form> 的 submit 事件触发校验（jsdom 不支持 submit 按钮的激活行为） */
    await wrapper.get('form').trigger('submit')
    /* 校验链路为异步，等待校验结果与错误渲染完成 */
    await flushPromises()
    expect(wrapper.emitted('respond')).toBeUndefined()
    expect(wrapper.text()).toContain('请输入响应说明')
  })

  it('填写后派发响应事件（含所选身份）', async () => {
    const individual: UserIdentity = { type: 'individual' }
    const company: UserIdentity = { type: 'community_enterprise', enterpriseId: 'E9001', enterpriseName: '芯启半导体' }
    const { wrapper } = await mountForm({ identities: [individual, company], userName: '张三', submitting: false })
    await wrapper.get('textarea').setValue('  我们可以承接这个需求  ')
    const chips = wrapper.findAll('.t-tag--checkable')
    expect(chips.length).toBe(2)
    await chips[1].trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('respond')?.at(-1)).toEqual(['我们可以承接这个需求', company])
  })

  it('社区个体出现后隐藏个人用户并清理旧选择', async () => {
    const individual: UserIdentity = { type: 'individual' }
    const communityIndividual: UserIdentity = { type: 'community_individual' }
    const company: UserIdentity = { type: 'community_enterprise', enterpriseId: 'E9001', enterpriseName: '芯启半导体' }
    const { wrapper, state } = await mountForm({ identities: [individual], userName: '张三', submitting: false })

    expect(wrapper.text()).toContain('个人用户')
    state.identities = [individual, communityIndividual, company]
    await nextTick()
    expect(wrapper.text()).not.toContain('个人用户')
    expect(wrapper.text()).toContain('社区个体')

    await wrapper.get('textarea').setValue('可以承接')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('respond')?.at(-1)).toEqual(['可以承接', communityIndividual])
  })

  it('clearNote 清空输入', async () => {
    const { wrapper } = await mountForm({ identities: [], userName: '张三', submitting: false })
    await wrapper.get('textarea').setValue('内容')
    ;(wrapper.vm as unknown as { clearNote: () => void }).clearNote()
    await nextTick()
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  })
})
