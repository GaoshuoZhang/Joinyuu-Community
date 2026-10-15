<script setup lang="ts">
import { computed } from 'vue'
import { Radio, RadioGroup } from 'tdesign-mobile-vue'
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

const keyOf = (identity: UserIdentity) => `${identity.type}:${identity.enterpriseId ?? ''}`
const selectedKey = computed(() => `${props.selected}:${props.selectedEnterpriseId ?? ''}`)
function select(value: string | number | boolean) {
  const identity = props.identities.find((item) => keyOf(item) === value)
  if (identity) emit('select', identity)
}
</script>

<template>
  <RadioGroup role="radiogroup" name="action-identity" class="identity-options" :value="selectedKey" aria-label="选择操作身份" @change="select">
    <Radio v-for="identity in identities" :key="keyOf(identity)" :value="keyOf(identity)" :label="identityOptionLabel(identity, userName)" :borderless="true" />
  </RadioGroup>
</template>

<style scoped>
.identity-options {
  display: flex;
  flex-direction: column;
  width: 100%;
  --td-radio-vertical-padding: 10px;
}
</style>
