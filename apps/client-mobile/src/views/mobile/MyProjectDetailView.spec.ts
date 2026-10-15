import { beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import MyProjectDetailView from './MyProjectDetailView.vue'
import { fetchMyProject } from '@/api/projects'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'P1' } }) }))
vi.mock('@/composables/useUnsavedGuard', () => ({ useUnsavedGuard: vi.fn() }))
vi.mock('@/api/projects', () => ({ fetchMyProject: vi.fn(), revokeProjectAttachmentUrls: vi.fn(),
  submitMilestone: vi.fn(), acceptMilestone: vi.fn(), returnMilestone: vi.fn() }))

beforeAll(() => { Element.prototype.scrollIntoView ??= () => {} })
async function mountProject(canSubmit = true) {
  vi.mocked(fetchMyProject).mockResolvedValue({ id: 'P1', name: '项目', role: canSubmit ? '本人承接' : '需求发起方',
    canSubmit, canAccept: false, progress: 0,
    milestones: [{ id: '1', title: '第一阶段', done: false, status: 'todo' }, { id: '2', title: '第二阶段', done: false, status: 'todo' }],
  })
  const wrapper = mount(MyProjectDetailView, { global: { plugins: [createPinia()], stubs: { RouterLink: true } } })
  await flushPromises()
  return wrapper
}

describe('项目详情草稿与权限', () => {
  it('切换里程碑和关闭编辑区均保留各自说明，离页保护仍识别隐藏草稿', async () => {
    const wrapper = await mountProject()
    const rows = wrapper.findAll('li.milestone')
    await rows[0].get('button').trigger('click')
    await rows[0].get('textarea').setValue('第一阶段的未提交说明')
    await rows[1].get('button').trigger('click')
    await rows[1].get('textarea').setValue('第二阶段的说明')
    await rows[0].get('button').trigger('click')
    expect((rows[0].get('textarea').element as HTMLTextAreaElement).value).toBe('第一阶段的未提交说明')
    const cancel = rows[0].findAll('button').find((button) => button.text() === '取消')!
    await cancel.trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)
    const isDirty = vi.mocked(useUnsavedGuard).mock.calls.at(-1)![0]
    expect(isDirty()).toBe(true)
    await rows[1].get('button').trigger('click')
    expect((rows[1].get('textarea').element as HTMLTextAreaElement).value).toBe('第二阶段的说明')
    wrapper.unmount()
  })
  it('具有需求方读取身份不等于拥有项目操作权限', async () => {
    const wrapper = await mountProject(false)
    expect(wrapper.text()).toContain('第一阶段')
    expect(wrapper.findAll('li.milestone button')).toHaveLength(0)
    wrapper.unmount()
  })
})
