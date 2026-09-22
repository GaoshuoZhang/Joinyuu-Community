<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import EmbeddedScope from '@/components/EmbeddedScope.vue'
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
    <!-- 卡片由本聚合壳统一提供（子面板均不自带 page-card）；关闭 destroyOnHide 避免切 tab 重播入场动画与布局跳动 -->
    <div class="page-card">
      <!-- 嵌入标记只能包住选项卡子树，否则本页页头也会一并隐藏 -->
      <EmbeddedScope>
        <t-tabs v-model="activeTab" class="embed-tabs" @change="onTabChange">
          <t-tab-panel v-for="t in tabs" :key="t.value" :value="t.value" :label="t.label" :destroy-on-hide="false">
            <component :is="t.comp" />
          </t-tab-panel>
        </t-tabs>
      </EmbeddedScope>
    </div>
  </div>
</template>

<style scoped>
/* 依赖 TDesign tabs 内部类 .t-tabs__content：嵌入选项卡时收紧顶部留白，无对应 API */
.embed-tabs :deep(.t-tabs__content) {
  padding-top: 8px;
}
</style>
