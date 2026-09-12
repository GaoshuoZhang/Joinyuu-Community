<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Icon, Navbar, TabBar, TabBarItem } from 'tdesign-mobile-vue'
import { NotificationIcon } from 'tdesign-icons-vue-next'
import { useNoticesStore } from '@/stores/notices'
import 'tdesign-mobile-vue/es/style/index.css'

/* 移动应用壳：TDesign Navbar 顶栏 + 内容出口 + 底部 5 Tab（首页/项目/社区/广场/我的）。
 * 项目 / 社区 / 广场为重构后的新 Tab（2026-09-13，见 m2-client-plan §5.3）。 */
const route = useRoute()
const router = useRouter()
const notices = useNoticesStore()

const tabs = [
  { value: '/', label: '首页', icon: 'home' },
  { value: '/projects', label: '项目', icon: 'app' },
  { value: '/community', label: '社区', icon: 'usergroup' },
  { value: '/plaza', label: '广场', icon: 'calendar' },
  { value: '/me', label: '我的', icon: 'user' },
] as const

const active = computed(() => '/' + (route.path.split('/')[1] ?? ''))

function onTabChange(value: string | number) {
  const path = String(value)
  if (path !== active.value) void router.push(path)
}

function onNotices() {
  void router.push('/notices')
}
</script>

<template>
  <div class="m-shell">
    <Navbar title="聚屿社区" :fixed="false" :safe-area-inset-top="false">
      <template #right>
        <Badge :count="notices.unread" :max-count="99">
          <NotificationIcon class="bell" size="22px" aria-label="站内信" @click="onNotices" />
        </Badge>
      </template>
    </Navbar>

    <main class="m-content">
      <router-view />
    </main>

    <TabBar :value="active" :fixed="true" :placeholder="false" safe-area-inset-bottom :bordered="true" @change="onTabChange">
      <TabBarItem v-for="tab in tabs" :key="tab.value" :value="tab.value">
        <template #icon><Icon :name="tab.icon" size="22px" /></template>
        {{ tab.label }}
      </TabBarItem>
    </TabBar>
  </div>
</template>

<style scoped>
.m-shell {
  --td-tab-bar-height: var(--app-mobile-tabbar-h);

  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--td-bg-color-page);
}

.m-content {
  flex: 1;
  padding-bottom: calc(var(--app-mobile-tabbar-h) + 16px);
}

.bell {
  display: block;
  color: var(--td-text-color-primary);
  cursor: pointer;
}
</style>
