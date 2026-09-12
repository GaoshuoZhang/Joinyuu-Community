<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ActionSheet, Avatar, Cell, CellGroup, Toast } from 'tdesign-mobile-vue'
import { useAuthStore, IDENTITY_LABELS } from '@/stores/auth'
import type { UserIdentity } from '@/types'
import { useNoticesStore } from '@/stores/notices'
import { fetchExperience } from '@/api/experience'
import IdentityTag from '@/components/shared/IdentityTag.vue'

const router = useRouter()
const auth = useAuthStore()
const notices = useNoticesStore()

const levelName = ref('')

const assetEntries = computed(() => [
  { path: '/me/points', label: '积分流水', note: `${auth.points.toLocaleString('zh-CN')} 分` },
  { path: '/me/experience', label: '经验等级', note: levelName.value || '未绑定' },
  { path: '/me/projects', label: '我的项目' },
])

const recordEntries = [
  { path: '/me/demands', label: '我的需求' },
  { path: '/me/responses', label: '我的响应' },
  { path: '/me/enrollments', label: '我的报名' },
  { path: '/me/orders', label: '我的订单' },
  { path: '/me/reservations', label: '我的预约' },
  { path: '/me/articles', label: '我的投稿' },
  { path: '/me/applications', label: '我的申请' },
]

const moreEntries = [
  { path: '/me/profile/edit', label: '编辑资料' },
  { path: '/notices', label: '站内信', note: notices.unread > 0 ? `${notices.unread} 条未读` : '' },
]

/* 切换身份：ActionSheet 列出全部可切换身份（社区个体时不再单列个人用户）
 * 选项格式：「个人用户」某某某 /「社区企业」某某某有限公司 - 总经理 */
const identitySheetVisible = ref(false)

function identityOptionLabel(i: UserIdentity): string {
  const tag = `「${IDENTITY_LABELS[i.type]}」`
  if (i.type === 'community_enterprise') {
    return i.enterpriseRole ? `${tag}${i.enterpriseName} - ${i.enterpriseRole}` : `${tag}${i.enterpriseName}`
  }
  if (i.type === 'external_enterprise') return `${tag}${i.organizationName}`
  return `${tag}${auth.name}`
}

const identityItems = computed(() =>
  auth.switchableIdentities.map((i) => ({
    label: identityOptionLabel(i),
    description: i.type === auth.activeIdentity ? '当前身份' : '',
    color: i.type === auth.activeIdentity ? 'var(--td-brand-color)' : undefined,
  })),
)

function onIdentitySelected(_selected: unknown, index: number) {
  const target = auth.switchableIdentities[index]
  if (!target) return
  auth.switchIdentity(target.type)
  Toast(`已切换为「${IDENTITY_LABELS[target.type]}」`)
}

onMounted(async () => {
  notices.refreshUnread()
  try {
    const ex = await fetchExperience()
    levelName.value = `Lv.${ex.level} ${ex.levelName}`
  } catch {
    /* 未绑定社区个体身份时忽略 */
  }
})

async function onLogout() {
  await auth.logout()
  notices.reset()
  await router.push('/login')
}
</script>

<template>
  <div class="page-fade-in me">
    <section class="m-card profile pressable" @click="router.push('/me/profile/edit')">
      <Avatar size="56px" class="avatar">{{ auth.name.slice(0, 1) }}</Avatar>
      <div class="info">
        <p class="name">{{ auth.name }}</p>
        <p class="uid">UID {{ auth.uid }}</p>
        <div class="tags">
          <IdentityTag v-for="i in auth.profileIdentities" :key="i.type" :type="i.type" />
        </div>
      </div>
      <div class="stats">
        <b>{{ auth.points.toLocaleString('zh-CN') }}</b>
        <span>积分</span>
      </div>
    </section>

    <CellGroup theme="card">
      <Cell
        title="当前身份"
        :note="auth.activeIdentityLabel"
        arrow
        @click="identitySheetVisible = true"
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

    <ActionSheet
      v-model:visible="identitySheetVisible"
      :items="identityItems"
      description="切换后，社区服务将按当前身份展示"
      cancel-text="取消"
      :popup-props="{ closeOnOverlayClick: true }"
      @close="identitySheetVisible = false"
      @cancel="identitySheetVisible = false"
      @selected="onIdentitySelected"
    />
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
  box-shadow: 0 0 0 3px var(--td-bg-color-container), 0 0 0 5px var(--td-brand-color-2);
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

.stats {
  flex-shrink: 0;
  text-align: center;
  padding-left: 8px;
  border-left: 1px solid var(--td-component-border);
}

.stats b {
  display: block;
  font-size: 20px;
  color: var(--td-brand-color);
}

.stats span {
  font-size: 12px;
  color: var(--td-text-color-secondary);
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
