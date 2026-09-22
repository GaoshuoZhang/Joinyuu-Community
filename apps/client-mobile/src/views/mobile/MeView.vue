<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
import { buildProfileMenuSections, type ProfileMenuEntry } from '@/utils/profileMenu'

useAnimSuppress()

/* 个人中心：按身份、服务、权益、设置归类；详细业务记录和设置继续由二级页收纳。
 * 身份不做全局切换，发布/提交时在表单内选择归属。 */
const router = useRouter()
const auth = useAuthStore()
const notices = useNoticesStore()

const levelName = ref('')
const myIdentities = ref<MyIdentitySummary[]>([])
/* 等级请求失败与「未绑定」是两回事：失败时给出可重试的说明，而不是静默显示「未绑定」 */
const levelFailed = ref(false)

const menuSections = computed(() =>
  buildProfileMenuSections({
    hasCommunityIndividual: auth.hasCommunityIndividual,
    identityCount: myIdentities.value.length,
    pointsLabel: `${formatZhNumber(auth.points)} 分`,
    levelLabel: levelName.value,
    levelFailed: levelFailed.value,
    unread: notices.unread,
  }),
)

function onMenuTap(entry: ProfileMenuEntry) {
  if (entry.action === 'retry-level') {
    void loadLevel()
    return
  }
  void router.push(entry.path)
}

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
  levelFailed.value = false
  if (!auth.isLogged || !auth.hasCommunityIndividual) {
    levelName.value = ''
    return
  }
  try {
    const ex = await fetchExperience()
    levelName.value = `Lv.${ex.level} ${ex.levelName}`
  } catch {
    /* 失败态：清空等级并在入口上提示重试（与「未绑定」区分） */
    levelName.value = ''
    levelFailed.value = true
  }
}

/* 下拉刷新：同步资料与多身份，保证响应需求等入口拿到最新企业身份 */
const refreshing = ref(false)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
async function onRefresh() {
  refreshing.value = true
  try {
    await auth.refreshProfile()
    await Promise.all([loadIdentities(), loadLevel()])
    if (auth.isLogged) await notices.refreshUnread()
  } finally {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshing.value = false
      refreshTimer = null
    }, 300)
  }
}

onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = null
})

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
      <button
        type="button"
        class="m-card profile profile-button pressable"
        v-pressable
        aria-label="编辑个人资料"
        @click="router.push('/me/profile/edit')"
      >
        <Avatar size="56px" class="avatar" hide-on-load-failed :image="auth.avatar">{{ auth.name.slice(0, 1) }}</Avatar>
        <div class="info">
          <p class="name">{{ auth.name }}</p>
          <p v-if="auth.username" class="handle">@{{ auth.username }}</p>
          <p class="uid">UID {{ auth.uid }}</p>
          <div class="tags">
            <IdentityTag v-for="i in auth.profileIdentities" :key="i.type" :type="i.type" />
          </div>
        </div>
      </button>

      <section v-for="section in menuSections" :key="section.title" class="menu-section" :aria-labelledby="`me-${section.title}`">
        <h2 :id="`me-${section.title}`" class="group-title">{{ section.title }}</h2>
        <CellGroup theme="card">
          <Cell v-for="entry in section.entries" :key="entry.path" :title="entry.label" arrow @click="onMenuTap(entry)">
            <template v-if="entry.emphasis && entry.note" #note>
              <span class="note-strong tabular-nums">{{ entry.note }}</span>
            </template>
            <template v-else-if="entry.note" #note>{{ entry.note }}</template>
          </Cell>
        </CellGroup>
      </section>
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

.profile-button {
  width: 100%;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.menu-section {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
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

.handle {
  margin: 0 0 var(--app-space-2);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
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
  font-weight: 500;
  color: var(--td-text-color-secondary);
}

/* 资产数值（积分/等级）强调：反「标签比数值重」的层级倒置 */
.note-strong {
  color: var(--td-brand-color);
  font-weight: 600;
}
</style>
