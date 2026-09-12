<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import AuditLogPanel from './AuditLogPanel.vue'
import LoginLogsPanel from './LoginLogsPanel.vue'

/* 「日志与审计」聚合页：操作日志 / 登录日志 两个选项卡。
 * tab 与路由 query 同步（旧路径 /logs/audit|login 重定向到对应 tab）；
 * 无权限的选项卡不渲染，默认落在第一个有权限的选项卡 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

interface TabDef {
  value: string
  label: string
  perm: string
  comp: unknown
}

const ALL_TABS: TabDef[] = [
  { value: 'audit', label: '操作日志', perm: '/logs/audit', comp: markRaw(AuditLogPanel) },
  { value: 'login', label: '登录日志', perm: '/logs/login', comp: markRaw(LoginLogsPanel) },
]

const tabs = computed(() => ALL_TABS.filter((t) => auth.hasPerm(t.perm)))
const activeTab = ref('')

function resolveTab(): string {
  const q = String(route.query.tab ?? '')
  if (tabs.value.some((t) => t.value === q)) return q
  return tabs.value[0]?.value ?? ''
}

function syncTab() {
  const next = resolveTab()
  if (next && next !== activeTab.value) activeTab.value = next
}

watch(() => route.query.tab, syncTab)
onMounted(syncTab)

function onTabChange(v: string | number) {
  const value = String(v)
  activeTab.value = value
  if (route.query.tab !== value) router.replace({ query: { ...route.query, tab: value } })
}
</script>

<template>
  <div class="log-audit-view page-fade-in">
    <PageHeader title="日志与审计" description="操作日志与登录日志的统一查询" />
    <div class="page-card">
      <t-tabs v-model="activeTab" class="embed-tabs" @change="onTabChange">
        <t-tab-panel v-for="t in tabs" :key="t.value" :value="t.value" :label="t.label">
          <component :is="t.comp" />
        </t-tab-panel>
      </t-tabs>
    </div>
  </div>
</template>

<style scoped>
/* 子页面自带 PageHeader：聚合页内隐藏，避免与聚合页标题重复 */
.page-card :deep(.page-header) {
  display: none;
}

.embed-tabs :deep(.t-tabs__content) {
  padding-top: 8px;
}
</style>
