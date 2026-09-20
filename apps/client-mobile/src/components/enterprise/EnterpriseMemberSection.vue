<script setup lang="ts">
import { computed } from 'vue'
import { Button, Cell, Tag } from 'tdesign-mobile-vue'
import type { EnterpriseMemberInfo, EnterpriseInvitation } from '@/types'
import { formatZhNumber } from '@/utils/format'

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
        :note="[inv.role, inv.phone, inv.status === 'expired' ? '已过期' : '待对方确认'].filter(Boolean).join(' · ')"
        :bordered="false"
      >
        <template #right-icon>
          <Tag v-if="inv.status === 'expired'" size="small" variant="light" theme="default">已过期</Tag>
          <Button
            v-else-if="canInvite"
            size="small"
            variant="outline"
            @click.stop="$emit('revoke', inv)"
          >
            撤销
          </Button>
        </template>
      </Cell>
    </div>
    <div class="members">
      <Cell
        v-for="m in members"
        :key="m.phone ?? m.name"
        :title="m.name"
        :note="[m.role, m.phone].filter(Boolean).join(' · ')"
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
  font-size: var(--app-font-subtitle);
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

.members-hint {
  margin: var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
