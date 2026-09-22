<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import PageHeader from '@/components/PageHeader.vue'
import EmbeddedScope from '@/components/EmbeddedScope.vue'
import AdminPanel from './AdminPanel.vue'
import RolePanel from './RolePanel.vue'
import SessionPanel from './SessionPanel.vue'

/* 「角色与账号」聚合页：管理员账号 / 角色权限 / 在线会话 三个选项卡。
 * tab 与路由 query 同步（旧路径 /system/admins|roles|sessions 重定向到对应 tab）；
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
  { value: 'admins', label: '管理员账号', perm: '/system/admins', comp: markRaw(AdminPanel) },
  { value: 'roles', label: '角色权限', perm: '/system/roles', comp: markRaw(RolePanel) },
  { value: 'sessions', label: '在线会话', perm: '/system/sessions', comp: markRaw(SessionPanel) },
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
  <div class="account-role-view page-fade-in">
    <PageHeader title="角色与账号" description="管理员账号、角色权限与在线会话的统一管理" />
    <!-- 卡片由本聚合壳统一提供（子面板不自带 page-card）；关闭 destroyOnHide 避免切 tab 重播入场动画与布局跳动 -->
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
