<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, Cell, CellGroup, PullDownRefresh } from 'tdesign-mobile-vue'
import { useAuthStore } from '@/stores/auth'
import { useNoticesStore } from '@/stores/notices'
import { fetchExperience } from '@/api/experience'
import { fetchMyIdentities } from '@/api/enterprises'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import type { MyIdentitySummary } from '@/types'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { formatZhNumber } from '@/utils/format'
import { buildProfileMoreEntries } from '@/utils/profileMenu'

useAnimSuppress()

/* 个人中心（精简版）：资料卡 + 关联身份 + 资产；其余记录/设置收进二级页
 * （/me/records、/me/settings），避免入口过多。身份不做全局切换（发布/提交时在表单内选择归属）。 */
const router = useRouter()
const auth = useAuthStore()
const notices = useNoticesStore()

const levelName = ref('')
const myIdentities = ref<MyIdentitySummary[]>([])

const assetEntries = computed(() => {
  /* emphasis：真实数值（积分/等级）用品牌色加重，与「券码/物流」这类说明性文案区分 */
  const entries: { path: string; label: string; note?: string; emphasis?: boolean }[] = [
    { path: '/me/points', label: '我的积分', note: `${formatZhNumber(auth.points)} 分`, emphasis: true },
    { path: '/me/orders', label: '我的订单', note: '券码 / 物流 / 评价' },
    { path: '/me/leases', label: '我的租约', note: '办公位 / 租期 / 租金' },
  ]
  if (auth.hasCommunityIndividual) {
    entries.push({
      path: '/me/experience',
      label: '我的等级',
      note: levelName.value || '未绑定',
      emphasis: Boolean(levelName.value),
    })
  }
  return entries
})

const moreEntries = computed(() => buildProfileMoreEntries(auth.hasCommunityIndividual, notices.unread))

async function loadIdentities() {
  if (!auth.isLogged) {
    myIdentities.value = []
    return
  }
  try {
    myIdentities.value = await fetchMyIdentities()
  } catch {
    /* 无关联身份时忽略 */
  }
}

async function loadLevel() {
  if (!auth.isLogged || !auth.hasCommunityIndividual) {
    levelName.value = ''
    return
  }
  try {
    const ex = await fetchExperience()
    levelName.value = `Lv.${ex.level} ${ex.levelName}`
  } catch {
    /* 未绑定时忽略 */
  }
}

/* 下拉刷新：同步资料与多身份，保证响应需求等入口拿到最新企业身份 */
const refreshing = ref(false)
async function onRefresh() {
  refreshing.value = true
  try {
    await auth.refreshProfile()
    await Promise.all([loadIdentities(), loadLevel()])
    if (auth.isLogged) await notices.refreshUnread()
  } finally {
    setTimeout(() => {
      refreshing.value = false
    }, 300)
  }
}

async function refreshMe() {
  await auth.refreshProfile()
  await Promise.all([loadLevel(), loadIdentities(), notices.refreshUnread()])
}

onMounted(() => void refreshMe())
useRefreshOnActivate(() => void refreshMe())
</script>

<template>
  <PullDownRefresh class="me-refresh" :value="refreshing" @refresh="onRefresh">
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
        <Cell v-for="e in assetEntries" :key="e.path" :title="e.label" arrow @click="router.push(e.path)">
          <template v-if="e.emphasis && e.note" #note>
            <span class="note-strong tabular-nums">{{ e.note }}</span>
          </template>
          <template v-else-if="e.note" #note>{{ e.note }}</template>
        </Cell>
      </CellGroup>

      <p class="group-title">更多</p>
      <CellGroup theme="card">
        <Cell v-for="e in moreEntries" :key="e.path" :title="e.label" :note="e.note" arrow @click="router.push(e.path)" />
      </CellGroup>
    </div>
  </PullDownRefresh>
</template>

<style scoped>
.me {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

/* 整页下拉刷新：组件根默认 height:100% + overflow:hidden 会把最后一个选项裁在容器边界上，
 * 改为内容驱动高度并允许溢出，保证整页可下拉且底部完整可见 */
.me-refresh {
  height: auto;
  min-height: 100%;
  overflow: visible;
}

.me-refresh :deep(.t-pull-down-refresh__track) {
  height: auto;
}

.profile {
  display: flex;
  align-items: center;
  gap: var(--app-space-6);
}

.avatar {
  font-size: var(--app-font-title);
  font-weight: 600;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0 0 var(--app-space-2);
  font-size: var(--app-font-title);
  font-weight: 600;
}

.uid {
  margin: 0 0 var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-3);
}

/* 卡片宽度与 .m-card 对齐：CellGroup 自带外边距与页面容器 padding 叠加导致偏窄，置零并补边框 */
.me :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}

.group-title {
  margin: 0 var(--app-space-1);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

/* 资产数值（积分/等级）强调：反「标签比数值重」的层级倒置 */
.note-strong {
  color: var(--td-brand-color);
  font-weight: 600;
}
</style>
