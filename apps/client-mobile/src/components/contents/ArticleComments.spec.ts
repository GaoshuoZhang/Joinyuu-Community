import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ArticleComments from './ArticleComments.vue'
import type { UserIdentity } from '@/types'

describe('ArticleComments', () => {
  it('uses community individual instead of a stale individual selection', async () => {
    const individual: UserIdentity = { type: 'individual' }
    const communityIndividual: UserIdentity = { type: 'community_individual' }
    const company: UserIdentity = { type: 'community_enterprise', enterpriseId: 'E9001', enterpriseName: '芯启半导体' }
    const wrapper = mount(ArticleComments, {
      props: {
        comments: [],
        identities: [individual],
        userName: '张三',
        modelValue: '这篇文章很有帮助',
        submitting: false,
      },
    })

    expect(wrapper.text()).toContain('个人用户')
    await wrapper.setProps({ identities: [individual, communityIndividual, company] })
    expect(wrapper.text()).not.toContain('个人用户')
    expect(wrapper.text()).toContain('社区个体')

    await wrapper.get('.comment-submit').trigger('click')
    expect(wrapper.emitted('submit')?.at(-1)).toEqual([communityIndividual])
  })
})
