<script setup lang="ts">
import { computed } from 'vue'
import { Tag } from 'tdesign-mobile-vue'

/* 状态标签：TDesign Tag 轻封装（kind 决定状态集，配色与 admin StatusTag 口径一致：
 * warning=待定 / success=通过 / danger=驳回 / primary=中间态 / default=终态）。
 * 页面禁止自定状态文案与颜色：新增状态先在此登记 kind，再在页面引用。 */
const props = defineProps<{
  kind:
    | 'demand'
    | 'response'
    | 'enroll'
    | 'order'
    | 'reservation'
    | 'article'
    | 'application'
    | 'lease'
    | 'invitation'
    | 'milestone'
    | 'ticket'
    | 'goods'
    | 'space'
    | 'project'
    | 'realname'
    | 'flag'
    | 'userMessage'
  value: string
}>()

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger'

const map: Record<string, Record<string, { label: string; tone: Tone }>> = {
  demand: {
    pending: { label: '待审核', tone: 'warning' },
    pending_release: { label: '待发布', tone: 'primary' },
    scheduled: { label: '定时发布中', tone: 'primary' },
    published: { label: '已发布', tone: 'success' },
    selected: { label: '已选定', tone: 'primary' },
    projected: { label: '已立项', tone: 'success' },
    withdrawn: { label: '已撤回', tone: 'default' },
    rejected: { label: '已驳回', tone: 'danger' },
    closed: { label: '已关闭', tone: 'default' },
  },
  response: {
    pending: { label: '待选定', tone: 'warning' },
    pending_review: { label: '待审核', tone: 'warning' },
    contacted: { label: '已联系', tone: 'primary' },
    accepted: { label: '已选定', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
    closed: { label: '已结束', tone: 'default' },
    withdrawn: { label: '已撤回', tone: 'default' },
  },
  enroll: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    waitlisted: { label: '候补中', tone: 'primary' },
    rejected: { label: '已驳回', tone: 'danger' },
    cancelled: { label: '已取消', tone: 'default' },
  },
  order: {
    pending_use: { label: '待使用', tone: 'primary' },
    completed: { label: '已完成', tone: 'success' },
    cancelled: { label: '已取消', tone: 'default' },
    expired: { label: '已过期', tone: 'danger' },
  },
  reservation: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    /* 服务端派生：已通过且已过预约结束时间 */
    ended: { label: '已完成', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
    cancelled: { label: '已取消', tone: 'default' },
  },
  article: {
    pending: { label: '待审核', tone: 'warning' },
    pending_release: { label: '待发布', tone: 'primary' },
    rejected: { label: '已驳回', tone: 'danger' },
    withdrawn: { label: '已撤回', tone: 'default' },
    published: { label: '已发布', tone: 'success' },
    scheduled: { label: '定时发布中', tone: 'primary' },
    closed: { label: '已关闭', tone: 'default' },
  },
  application: {
    pending: { label: '待审核', tone: 'warning' },
    approved: { label: '已通过', tone: 'success' },
    rejected: { label: '已驳回', tone: 'danger' },
    withdrawn: { label: '已撤回', tone: 'default' },
  },
  lease: {
    active: { label: '生效中', tone: 'success' },
    expiring: { label: '即将到期', tone: 'warning' },
    expired: { label: '已到期', tone: 'danger' },
    terminated: { label: '已终止', tone: 'default' },
  },
  /* 企业成员邀请（/me/invitations/:id、企业成员区） */
  invitation: {
    pending: { label: '待接受', tone: 'warning' },
    accepted: { label: '已加入', tone: 'success' },
    rejected: { label: '已拒绝', tone: 'default' },
    revoked: { label: '已撤销', tone: 'default' },
    expired: { label: '已过期', tone: 'default' },
  },
  /* 项目里程碑交付验收 */
  milestone: {
    pending: { label: '待提交', tone: 'default' },
    submitted: { label: '待验收', tone: 'warning' },
    accepted: { label: '已验收', tone: 'success' },
  },
  /* 活动电子票（`cancelled` / `expired` 分别表示活动取消与活动结束后的失效） */
  ticket: {
    valid: { label: '有效', tone: 'primary' },
    checked: { label: '已签到', tone: 'success' },
    waitlisted: { label: '候补中', tone: 'warning' },
    cancelled: { label: '已失效（活动取消）', tone: 'danger' },
    expired: { label: '已失效（活动结束）', tone: 'danger' },
  },
  /* 积分商品库存状态 */
  goods: {
    sold_out: { label: '已售罄', tone: 'warning' },
  },
  /* 空间开放状态 */
  space: {
    open: { label: '开放中', tone: 'success' },
    maintenance: { label: '维护中', tone: 'warning' },
  },
  /* 项目结项标记 */
  project: {
    finished: { label: '已结项', tone: 'success' },
  },
  /* 实名认证 / 身份信息登记 */
  realname: {
    verified: { label: '已认证', tone: 'success' },
    registered: { label: '已登记', tone: 'success' },
  },
  /* 本人的参与标记（已响应/已报名），与业务生命周期状态区分：统一用品牌色中间态 */
  flag: {
    responded: { label: '已响应', tone: 'primary' },
    enrolled: { label: '已报名', tone: 'primary' },
  },
  /* 用户留言处理状态（与后台 StatusTag 的 userMessage 口径一致） */
  userMessage: {
    pending: { label: '待回复', tone: 'warning' },
    replied: { label: '已回复', tone: 'success' },
  },
}

const meta = computed(() => map[props.kind]?.[props.value] ?? { label: props.value, tone: 'default' as Tone })
</script>

<template>
  <Tag :theme="meta.tone" variant="light" size="small">{{ meta.label }}</Tag>
</template>
