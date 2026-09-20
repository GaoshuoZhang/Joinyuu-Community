<script setup lang="ts">
import { CheckTag } from 'tdesign-mobile-vue'
import { identityOptionLabel } from '@/stores/auth'
import type { UserIdentity } from '@/types'

/* 身份选择 chips：发布/响应/预约等场景按身份归属选择（企业需同时匹配企业 id）。 */
const props = defineProps<{
  identities: UserIdentity[]
  selected: string
  selectedEnterpriseId?: string
  userName: string
}>()

const emit = defineEmits<{ select: [identity: UserIdentity] }>()

function isPicked(identity: UserIdentity): boolean {
  return props.selected === identity.type && (identity.type !== 'community_enterprise' || props.selectedEnterpriseId === (identity.enterpriseId ?? ''))
}
</script>

<template>
  <div class="chips">
    <CheckTag
      v-for="identity in identities"
      :key="`${identity.type}:${identity.enterpriseId ?? ''}`"
      variant="light"
      size="medium"
      :checked="isPicked(identity)"
      @change="emit('select', identity)"
    >
      {{ identityOptionLabel(identity, userName) }}
    </CheckTag>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-4);
}
</style>
