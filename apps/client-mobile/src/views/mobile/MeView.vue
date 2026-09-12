<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Cell, CellGroup } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import IdentityTag from '@/components/shared/IdentityTag.vue'

const router = useRouter()
const auth = useAuthStore()
const notices = useNoticesStore()

const entries = [
  { path: '/me/points', label: '积分流水' },
  { path: '/me/experience', label: '经验等级' },
  { path: '/me/demands', label: '我的需求' },
  { path: '/me/responses', label: '我的响应' },
  { path: '/me/enrollments', label: '我的报名' },
  { path: '/me/orders', label: '我的订单' },
  { path: '/me/reservations', label: '我的预约' },
  { path: '/me/articles', label: '我的投稿' },
  { path: '/me/applications', label: '我的申请' },
  { path: '/me/projects', label: '我的项目' },
]

onMounted(() => notices.refreshUnread())

async function onLogout() {
  await auth.logout()
  notices.reset()
  await router.push('/login')
}
</script>

<template>
  <div class="page-fade-in me">
    <section class="m-card profile">
      <div class="avatar">{{ auth.name.slice(0, 1) }}</div>
      <div class="info">
        <p class="name">{{ auth.name }}</p>
        <p class="uid">UID {{ auth.uid }}</p>
        <div class="tags">
          <IdentityTag v-for="i in auth.identities" :key="i.type" :type="i.type" />
        </div>
      </div>
      <div class="points">
        <b>{{ auth.points.toLocaleString('zh-CN') }}</b>
        <span>积分</span>
      </div>
    </section>

    <CellGroup theme="card">
      <Cell v-for="e in entries" :key="e.path" :title="e.label" arrow @click="router.push(e.path)" />
      <Cell title="编辑资料" arrow @click="router.push('/me/profile/edit')" />
      <Cell
        title="站内信"
        :note="notices.unread > 0 ? `${notices.unread} 条未读` : ''"
        arrow
        @click="router.push('/notices')"
      />
      <Cell class="logout" title="退出登录" arrow @click="onLogout" />
    </CellGroup>
  </div>
</template>

<style scoped>
.me {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile {
  display: flex;
  align-items: center;
  gap: 14px;
}

.avatar {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
  font-size: 22px;
  font-weight: 700;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
}

.uid {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.points {
  text-align: center;
}

.points b {
  display: block;
  font-size: 20px;
  color: var(--td-brand-color);
}

.points span {
  font-size: 11px;
  color: var(--td-text-color-secondary);
}

.logout {
  color: var(--td-error-color);
}
</style>
