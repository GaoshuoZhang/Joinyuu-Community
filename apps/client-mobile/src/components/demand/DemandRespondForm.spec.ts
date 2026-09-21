import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import DemandRespondForm from './DemandRespondForm.vue'
import type { UserIdentity } from '@/types'

describe('DemandRespondForm', () => {
  it('空内容提交时不派发事件并展示行内错误', async () => {
    const wrapper = mount(DemandRespondForm, { props: { identities: [], userName: '张三', submitting: false } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('respond')).toBeUndefined()
    expect(wrapper.text()).toContain('请输入响应说明')
  })

  it('填写后派发响应事件（含所选身份）', async () => {
    const individual: UserIdentity = { type: 'individual' }
    const company: UserIdentity = { type: 'community_enterprise', enterpriseId: 'E9001', enterpriseName: '芯启半导体' }
    const wrapper = mount(DemandRespondForm, {
      props: { identities: [individual, company], userName: '张三', submitting: false },
    })
    await wrapper.get('textarea').setValue('  我们可以承接这个需求  ')
    const chips = wrapper.findAll('.t-tag--checkable')
    expect(chips.length).toBe(2)
    await chips[1].trigger('click')
    await wrapper.findAll('button').at(-1)!.trigger('click')
    expect(wrapper.emitted('respond')?.at(-1)).toEqual(['我们可以承接这个需求', company])
  })

  it('社区个体出现后隐藏个人用户并清理旧选择', async () => {
    const individual: UserIdentity = { type: 'individual' }
    const communityIndividual: UserIdentity = { type: 'community_individual' }
    const company: UserIdentity = { type: 'community_enterprise', enterpriseId: 'E9001', enterpriseName: '芯启半导体' }
    const wrapper = mount(DemandRespondForm, {
      props: { identities: [individual], userName: '张三', submitting: false },
    })

    expect(wrapper.text()).toContain('个人用户')
    await wrapper.setProps({ identities: [individual, communityIndividual, company] })
    expect(wrapper.text()).not.toContain('个人用户')
    expect(wrapper.text()).toContain('社区个体')

    await wrapper.get('textarea').setValue('可以承接')
    await wrapper.findAll('button').at(-1)!.trigger('click')
    expect(wrapper.emitted('respond')?.at(-1)).toEqual(['可以承接', communityIndividual])
  })

  it('clearNote 清空输入', async () => {
    const wrapper = mount(DemandRespondForm, { props: { identities: [], userName: '张三', submitting: false } })
    await wrapper.get('textarea').setValue('内容')
    ;(wrapper.vm as unknown as { clearNote: () => void }).clearNote()
    await nextTick()
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
  })
})
