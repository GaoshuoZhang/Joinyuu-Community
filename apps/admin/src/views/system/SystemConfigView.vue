<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import EmbeddedScope from '@/components/EmbeddedScope.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const allTabs = [
  { value: 'settings', label: '基础设置', perm: '/system/config', component: defineAsyncComponent(() => import('./SystemConfigPanel.vue')) },
  { value: 'themes', label: '移动端主题', perm: '/system/config', component: defineAsyncComponent(() => import('./MobileThemesPanel.vue')) },
  { value: 'notifications', label: '通知渠道配置', perm: '/system/messages', component: defineAsyncComponent(() => import('./MessageCenterView.vue')) },
  { value: 'archive', label: '归档管理', perm: '/system/trash', component: defineAsyncComponent(() => import('./ArchivePanel.vue')) },
  { value: 'payment', label: '收款配置', perm: '/system/config', component: defineAsyncComponent(() => import('./PaymentConfigView.vue')) },
]
const tabs = computed(() => allTabs.filter(tab => auth.hasPerm(tab.perm)))
const activeTab = computed({
  get: () => tabs.value.find(tab => tab.value === route.query.tab)?.value ?? tabs.value[0]?.value ?? '',
  set: (tab: string | number) => { void router.replace({ query: { ...route.query, tab: String(tab) } }) },
})
onMounted(() => { if (route.query.section === 'payment') void router.replace({ query: { ...route.query, section: undefined, tab: 'payment', provider: 'wechat' } }) })
</script>

<template>
  <div class="system-config-view page-fade-in">
    <PageHeader title="系统配置" description="管理基础设置、移动端主题、通知渠道、归档数据与收款配置" />
    <EmbeddedScope>
      <t-tabs v-model="activeTab" class="settings-tabs" aria-label="系统配置栏目">
        <t-tab-panel v-for="tab in tabs" :key="tab.value" :value="tab.value" :label="tab.label" lazy :destroy-on-hide="false">
          <component :is="tab.component" />
        </t-tab-panel>
      </t-tabs>
    </EmbeddedScope>
  </div>
</template>

<style scoped>
.settings-tabs :deep(.t-tabs__content) {
  padding-top: 16px;
  background: var(--td-bg-color-page);
}
.settings-tabs { min-width: 0; }
</style>
