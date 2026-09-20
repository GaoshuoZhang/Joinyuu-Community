<script setup lang="ts">
import type { UserIdentity } from '@/types'

/* 统一身份标签：个人用户/合作企业=灰、社区身份=品牌蓝
 * 所有需要展示用户身份的位置（列表/详情/卡片）一律复用此组件 */
const props = withDefaults(
  defineProps<{
    identities: UserIdentity[]
    /** 是否在社区企业身份标签内附带企业 ID；详情页已有独立 ID 展示时可关闭以避免同页重复 */
    showId?: boolean
  }>(),
  { showId: true },
)

function tagText(identity: UserIdentity): string {
  if (identity.type === 'individual') return '个人用户'
  if (identity.type === 'community_individual') return '社区个体'
  return `${identity.enterpriseName}·${identity.title}`
}

function tagTheme(identity: UserIdentity): 'default' | 'primary' {
  return identity.type === 'individual' || identity.type === 'external_enterprise' ? 'default' : 'primary'
}
</script>

<template>
  <span class="identity-tags">
    <t-tag v-if="props.identities.length === 0" variant="light" size="small">个人用户</t-tag>
    <template v-else>
      <t-tag
        v-for="(identity, i) in props.identities"
        :key="i"
        size="small"
        :variant="identity.type === 'external_enterprise' ? 'outline' : 'light'"
        :theme="tagTheme(identity)"
      >
        <template v-if="identity.type === 'community_enterprise'">
          {{ identity.enterpriseName }}<template v-if="props.showId && identity.enterpriseId"> [{{ identity.enterpriseId }}]</template> · {{ identity.title }}
        </template>
        <template v-else>{{ tagText(identity) }}</template>
      </t-tag>
    </template>
  </span>
</template>

<style scoped>
.identity-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
