import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ArticleComments from './ArticleComments.vue'
import type { ArticleComment, UserIdentity } from '@/types'

function makeComments(count: number): ArticleComment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i + 1}`,
    articleId: 'a1',
    uid: `u${i + 1}`,
    authorName: `用户${i + 1}`,
    content: `评论内容${i + 1}`,
    at: '2026-01-01T10:00:00+08:00',
  }))
}

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

  it('keeps incremental pagination via the List load-more footer', async () => {
    const wrapper = mount(ArticleComments, {
      props: {
        comments: makeComments(25),
        identities: [],
        userName: '张三',
        modelValue: '',
        submitting: false,
      },
    })

    expect(wrapper.findAll('.comment')).toHaveLength(20)

    /* jsdom 不触发滚动：改为点击 List 的加载更多 footer（仅 asyncLoading 为 load-more 时生效） */
    await wrapper.find('.t-list__loading--wrapper').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.comment')).toHaveLength(25)
    expect(wrapper.text()).not.toContain('加载更多')
  })
})
