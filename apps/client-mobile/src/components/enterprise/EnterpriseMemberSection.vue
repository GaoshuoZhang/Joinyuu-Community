<script setup lang="ts">
import { computed } from 'vue'
import { Button, Cell, Tag } from 'tdesign-mobile-vue'
import type { EnterpriseMemberInfo, EnterpriseInvitation } from '@/types'
import { formatZhNumber } from '@/utils/format'
import StateTag from '@/components/shared/StateTag.vue'

/* 企业成员区：待接受邀请 + 成员列表（权限提示）。 */
const props = withDefaults(
  defineProps<{
    members: EnterpriseMemberInfo[]
    invitations: EnterpriseInvitation[]
    canInvite?: boolean
    canManage?: boolean
    hint?: string
  }>(),
  { canInvite: false, canManage: false, hint: '' },
)

/* 仅展示待接受/已过期邀请；已接受/已拒绝/已撤销不再计入“待接受邀请”（D-012 修复） */
const visibleInvitations = computed(() =>
  props.invitations.filter((inv) => inv.status === 'pending' || inv.status === 'expired'),
)

defineEmits<{
  invite: []
  revoke: [invitation: EnterpriseInvitation]
  manage: [member: EnterpriseMemberInfo]
}>()

/* v46：成员手机号仅对有管理权限者完整展示，其余按 138****8888 脱敏（仅 UI 层处理）。 */
function maskPhone(value?: string): string {
  const phone = value ?? ''
  return /^\d{11}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
}

function memberNote(m: EnterpriseMemberInfo): string {
  return [m.role, m.phone ? (props.canManage ? m.phone : maskPhone(m.phone)) : ''].filter(Boolean).join(' · ')
}
</script>

<template>
  <section class="m-card">
    <div class="sec-head">
      <h3 class="sec-title no-margin">企业成员（{{ formatZhNumber(members.length) }}）</h3>
      <Button v-if="canInvite" theme="primary" size="small" @click="$emit('invite')">邀请成员</Button>
    </div>
    <div v-if="visibleInvitations.length" class="invites">
      <p class="members-hint">待接受邀请（{{ formatZhNumber(visibleInvitations.length) }}）</p>
      <Cell
        v-for="inv in visibleInvitations"
        :key="inv.id"
        :title="inv.memberName"
        :note="[inv.role, inv.phone].filter(Boolean).join(' · ')"
        :bordered="false"
      >
        <template #right-icon>
          <!-- v46：邀请状态统一走 StateTag（kind=invitation），不再自定文案与颜色 -->
          <div class="invite-actions">
            <StateTag kind="invitation" :value="inv.status" />
            <Button
              v-if="inv.status === 'pending' && canInvite"
              size="small"
              variant="outline"
              @click.stop="$emit('revoke', inv)"
            >
              撤销
            </Button>
          </div>
        </template>
      </Cell>
    </div>
    <div class="members">
      <Cell
        v-pressable="canManage && !m.isContact"
        v-for="m in members"
        :key="m.phone ?? m.name"
        :title="m.name"
        :note="memberNote(m)"
        :bordered="false"
        :arrow="canManage && !m.isContact"
        @click="canManage && !m.isContact ? $emit('manage', m) : undefined"
      >
        <template #right-icon>
          <Tag v-if="m.isContact" size="small" variant="light" theme="primary">负责人</Tag>
        </template>
      </Cell>
    </div>
    <p v-if="hint" class="members-hint">{{ hint }}</p>
  </section>
</template>

<style scoped>
.sec-title {
  margin: 0 0 var(--app-space-6);
  font: var(--app-type-section);
}

.sec-title.no-margin {
  margin:0;
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--app-space-5);
}

.members :deep(.t-cell) {
  padding-left:0;
  padding-right:0;
}

/* 邀请行右侧：状态标签 + 撤销操作（同一行依次排列） */
.invite-actions {
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
}

.members-hint {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-placeholder);
}
</style>
