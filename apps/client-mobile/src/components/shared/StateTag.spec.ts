import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import StateTag from './StateTag.vue'
import IdentityTag from './IdentityTag.vue'

describe('StateTag', () => {
  it('按状态集映射文案', () => {
    expect(mount(StateTag, { props: { kind: 'demand', value: 'published' } }).text()).toBe('已发布')
    expect(mount(StateTag, { props: { kind: 'response', value: 'accepted' } }).text()).toBe('已选定')
    expect(mount(StateTag, { props: { kind: 'demand', value: 'projected' } }).text()).toBe('已立项')
    expect(mount(StateTag, { props: { kind: 'enroll', value: 'waitlisted' } }).text()).toBe('候补中')
    expect(mount(StateTag, { props: { kind: 'order', value: 'completed' } }).text()).toBe('已完成')
    expect(mount(StateTag, { props: { kind: 'lease', value: 'active' } }).text()).toBe('生效中')
    expect(mount(StateTag, { props: { kind: 'lease', value: 'expiring' } }).text()).toBe('即将到期')
    expect(mount(StateTag, { props: { kind: 'lease', value: 'expired' } }).text()).toBe('已到期')
    expect(mount(StateTag, { props: { kind: 'lease', value: 'terminated' } }).text()).toBe('已终止')
    expect(mount(StateTag, { props: { kind: 'userMessage', value: 'pending' } }).text()).toBe('待回复')
    expect(mount(StateTag, { props: { kind: 'userMessage', value: 'replied' } }).text()).toBe('已回复')
  })

  it('未知状态回退为原值', () => {
    expect(mount(StateTag, { props: { kind: 'order', value: 'unknown_state' } }).text()).toBe('unknown_state')
  })
})

describe('IdentityTag', () => {
  it('按身份映射文案', () => {
    expect(mount(IdentityTag, { props: { type: 'community_enterprise' } }).text()).toBe('社区企业')
    expect(mount(IdentityTag, { props: { type: 'external_enterprise' } }).text()).toBe('合作企业')
    expect(mount(IdentityTag, { props: { type: 'individual' } }).text()).toBe('个人用户')
  })

  it('社区官方（后台自建需求）优先展示工作人员角色名', () => {
    expect(mount(IdentityTag, { props: { type: 'official', label: '运营' } }).text()).toBe('运营')
    expect(mount(IdentityTag, { props: { type: 'official' } }).text()).toBe('社区官方')
  })
})
