import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EventEnrollmentActions from './EventEnrollmentActions.vue'
import type { CommunityEvent } from '@/types'

const ButtonStub = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
})

const event: CommunityEvent = {
  id: 'EV-PAUSED',
  title: '暂停报名活动',
  typeLabel: '沙龙',
  startTime: '2026-10-01 14:00',
  endTime: '2026-10-01 16:00',
  location: '共享会议室 A',
  capacity: 20,
  requireReview: false,
  enrollmentOpen: false,
  enrollmentDeadline: '2026-09-30 18:00',
  status: 'published',
  visibilityIdentities: [],
  visibilityLevels: [],
  enrollmentIdentities: [],
  enrollmentLevels: [],
  description: '活动介绍',
  venueLat: 31.23,
  venueLng: 121.47,
  checkinRadiusM: 200,
  checkinOpenMin: 30,
  checkinCloseMin: 30,
}

function mountActions(overrides: Partial<InstanceType<typeof EventEnrollmentActions>['$props']> = {}) {
  return mount(EventEnrollmentActions, {
    props: {
      event,
      myCheckedIn: false,
      loggedIn: true,
      acting: false,
      cancelBlocked: false,
      disableReason: '',
      enrollForbidden: false,
      ...overrides,
    },
    global: {
      stubs: { Button: ButtonStub, Icon: true, teleport: true },
    },
  })
}

describe('EventEnrollmentActions', () => {
  it('未报名时无论是否登录都优先展示禁用的报名未开放按钮', async () => {
    const wrapper = mountActions({ loggedIn: false })
    const button = wrapper.get('button')

    expect(button.text()).toBe('报名未开放')
    expect(button.attributes()).toHaveProperty('disabled')
    expect(wrapper.text()).not.toContain('登录后报名')
    expect(wrapper.text()).not.toContain('立即报名')
    await button.trigger('click')
    expect(wrapper.emitted('enroll')).toBeUndefined()
  })

  it('报名被驳回后暂停报名时不允许重新报名', async () => {
    const wrapper = mountActions({ myStatus: 'rejected' })
    const button = wrapper.get('button')

    expect(button.text()).toBe('报名未开放')
    expect(button.attributes()).toHaveProperty('disabled')
    expect(wrapper.text()).not.toContain('重新报名')
    await button.trigger('click')
    expect(wrapper.emitted('enroll')).toBeUndefined()
  })

  it.each([
    ['pending', '取消报名', 'cancel'],
    ['waitlisted', '退出候补', 'cancel'],
  ] as const)('暂停报名不影响 %s 状态的既有操作', async (myStatus, label, eventName) => {
    const wrapper = mountActions({ myStatus })
    const button = wrapper.get('button')

    expect(button.text()).toBe(label)
    await button.trigger('click')
    expect(wrapper.emitted(eventName)).toHaveLength(1)
  })

  it('暂停报名不影响已通过报名的签到和取消操作', async () => {
    const wrapper = mountActions({ myStatus: 'approved' })
    const buttons = wrapper.findAll('button')

    expect(buttons.map((button) => button.text())).toEqual(['签到', '取消报名'])
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('checkIn')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
