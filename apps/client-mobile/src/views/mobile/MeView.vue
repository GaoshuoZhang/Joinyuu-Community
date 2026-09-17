<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, Cell, CellGroup, DialogPlugin } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import { fetchExperience } from '@/api/experience'
import { fetchMyIdentities } from '@/api/enterprises'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import type { MyIdentitySummary } from '@/types'
import { useAnimSuppress } from '@/composables/useAnimSuppress'

useAnimSuppress()

/* 个人中心：身份不做全局切换（发布/提交时在表单内选择归属）；
 * 「关联身份」列出全部身份（社区个体 + 各社区企业/合作企业），点入后按身份操作。 */
const router = useRouter()
const auth = useAuthStore()
const notices = useNoticesStore()

const levelName = ref('')
const myIdentities = ref<MyIdentitySummary[]>([])

const assetEntries = computed(() => {
  const entries: { path: string; label: string; note?: string }[] = [
    { path: '/me/points', label: '我的积分', note: `${auth.points.toLocaleString('zh-CN')} 分` },
  ]
  if (auth.hasCommunityIndividual) {
    entries.push({ path: '/me/experience', label: '我的等级', note: levelName.value || '未绑定' })
  }
  entries.push({ path: '/me/projects', label: '我的项目' })
  return entries
})

const recordEntries = [
  { path: '/me/demands', label: '我的需求' },
  { path: '/me/responses', label: '我的响应' },
  { path: '/me/enrollments', label: '我的报名' },
  { path: '/me/orders', label: '我的订单' },
  { path: '/me/reservations', label: '我的预约' },
  { path: '/me/articles', label: '我的投稿' },
  { path: '/me/applications', label: '我的申请' },
  { path: '/me/favorites', label: '我的收藏' },
  { path: '/me/history', label: '浏览历史' },
]

const moreEntries = computed(() => {
  const entries: { path: string; label: string; note?: string }[] = [
    { path: '/me/stats', label: '数据看板' },
    { path: '/me/profile/edit', label: '编辑资料' },
  ]
  const enterprise = auth.profileIdentities.find((i) => i.type === 'community_enterprise' && i.enterpriseId)
  if (enterprise?.enterpriseId) entries.splice(3, 0, { path: `/me/enterprises/${enterprise.enterpriseId}/workbench`, label: '企业工作台', note: enterprise.enterpriseName ?? '' })
  entries.push(
    { path: '/me/addresses', label: '收货地址' },
    { path: '/me/security', label: '账号与安全' },
    { path: '/notices', label: '站内信', note: notices.unread > 0 ? `${notices.unread} 条未读` : '' },
  )
  return entries
})

async function loadIdentities() {
  if (!auth.isLogged) return
  try {
    myIdentities.value = await fetchMyIdentities()
  } catch {
    /* 无关联身份时忽略 */
  }
}

async function loadLevel() {
  if (!auth.isLogged || !auth.hasCommunityIndividual) return
  try {
    const ex = await fetchExperience()
    levelName.value = `Lv.${ex.level} ${ex.levelName}`
  } catch {
    /* 未绑定时忽略 */
  }
}

onMounted(() => {
  notices.refreshUnread()
  void auth.refreshProfile()
  void loadLevel()
  void loadIdentities()
})

function onLogout() {
  DialogPlugin.confirm({
    title: '退出登录',
    content: '确认退出当前账号？未保存的编辑内容将丢失。',
    cancelBtn: '取消',
    confirmBtn: '确认退出',
    onConfirm: () => {
      void doLogout()
    },
  })
}

async function doLogout() {
  await auth.logout()
  notices.reset()
  await router.push('/login')
}
</script>

<template>
  <div class="page-fade-in me">
    <section class="m-card profile pressable" v-pressable @click="router.push('/me/profile/edit')">
      <Avatar size="56px" class="avatar" :image="auth.avatar">{{ auth.name.slice(0, 1) }}</Avatar>
      <div class="info">
        <p class="name">{{ auth.name }}</p>
        <p class="uid">UID {{ auth.uid }}</p>
        <div class="tags">
          <IdentityTag v-for="i in auth.profileIdentities" :key="i.type" :type="i.type" />
        </div>
      </div>
    </section>

    <CellGroup v-if="myIdentities.length" theme="card">
      <Cell
        title="关联身份"
        :note="`${myIdentities.length} 个`"
        arrow
        @click="router.push('/me/identities')"
      />
    </CellGroup>

    <p class="group-title">我的资产</p>
    <CellGroup theme="card">
      <Cell v-for="e in assetEntries" :key="e.path" :title="e.label" :note="e.note" arrow @click="router.push(e.path)" />
    </CellGroup>

    <p class="group-title">我的记录</p>
    <CellGroup theme="card">
      <Cell v-for="e in recordEntries" :key="e.path" :title="e.label" arrow @click="router.push(e.path)" />
    </CellGroup>

    <p class="group-title">更多</p>
    <CellGroup theme="card">
      <Cell v-for="e in moreEntries" :key="e.path" :title="e.label" :note="e.note" arrow @click="router.push(e.path)" />
      <Cell class="logout" title="退出登录" arrow @click="onLogout" />
    </CellGroup>
  </div>
</template>

<style scoped>
.me {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.profile {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
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
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.logout {
  color: var(--td-error-color);
}

/* 卡片宽度与 .m-card 对齐：CellGroup 自带 margin:0 16px 与页面容器 padding 叠加导致偏窄，置零并补边框 */
.me :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}

.group-title {
  margin: 0 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
