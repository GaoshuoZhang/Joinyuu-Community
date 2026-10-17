<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, List, Popup, Progress, Tabs, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { acceptMilestone, fetchMyProjects, returnMilestone } from '@/api/projects'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { Milestone, MyProject } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 移动「我的项目」：按「我承接的 / 我发起的」分标签页。
 * 「我发起的」= 我的需求立项生成的项目，或社区自建项目里需求方选了我 / 我负责的企业（服务端下发 isInitiator）；
 * 甲方可在列表卡片上直接对「待验收」节点做通过 / 退回（与详情页共用同一套服务端接口）。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList<MyProject[]>(fetchMyProjects)

const projects = computed(() => data.value ?? [])
/* 归属标记由服务端下发：同一项目可同时属于两侧，故不用互斥的 role 代替 */
const undertaken = computed(() => projects.value.filter((p) => p.isUndertaker))
const initiated = computed(() => projects.value.filter((p) => p.isInitiator))
const activeTab = ref<'undertaken' | 'initiated'>('undertaken')
const tabList = computed(() => [
  { label: `我承接的（${undertaken.value.length}）`, value: 'undertaken' },
  { label: `我发起的（${initiated.value.length}）`, value: 'initiated' },
])
const activeList = computed(() => (activeTab.value === 'initiated' ? initiated.value : undertaken.value))
const { visibleItems, hasMore, showMore } = useIncrementalList(activeList)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}

/* 空态分流：两个标签页各给出口（二级页没有 TabBar，空态必须能走出去） */
const emptyText = computed(() => (activeTab.value === 'initiated' ? '暂无发起的项目' : '暂无承接中的项目'))
const emptyActionText = computed(() => (activeTab.value === 'initiated' ? '发布需求' : '浏览需求'))
function onEmptyAction() {
  router.push(activeTab.value === 'initiated' ? '/demands/new' : '/projects')
}

/* v48：里程碑状态统一走 StateTag（kind=milestone），与详情页口径一致——
 * 本项目内部用 todo 表示未提交，StateTag 用 pending，需映射；未登记的值回落到「待提交」。 */
function milestoneTag(m: Milestone): string {
  const status = m.status ?? (m.done ? 'accepted' : 'todo')
  return status === 'submitted' || status === 'accepted' ? status : 'pending'
}

/* ---------- 甲方验收：在「我发起的」列表卡片上直接完成，无需先进详情 ---------- */
const acceptVisible = ref(false)
const acceptTargetId = ref('')
const actingOn = ref('')
const returnFor = ref('')
const returnReason = ref('')
const returnError = ref('')

/* 目标从最新列表数据反查：验收/退回后 run() 会换掉 data，直接持有旧对象会读到过期状态 */
const acceptTarget = computed(() => projects.value.find((p) => p.id === acceptTargetId.value) ?? null)
/** 待验收节点（列表 DTO 已含 status，无需再拉详情） */
const pendingTargets = computed(() => (acceptTarget.value?.milestones ?? []).filter((m) => (m.status ?? 'todo') === 'submitted'))
function pendingCount(p: MyProject): number {
  return p.milestones.filter((m) => (m.status ?? 'todo') === 'submitted').length
}

function isActing(m: Milestone, action: 'accept' | 'return') {
  return actingOn.value === `${m.id}:${action}`
}

function openAccept(p: MyProject) {
  acceptTargetId.value = p.id
  returnFor.value = ''
  returnReason.value = ''
  returnError.value = ''
  acceptVisible.value = true
}

function closeAccept() {
  if (actingOn.value) return
  /* 已填写的退回原因不静默丢弃 */
  if (returnFor.value && returnReason.value.trim()) {
    confirmDialog({
      title: '放弃退回原因？',
      content: '已填写的退回原因不会保存。',
      cancelBtn: '继续填写',
      confirmBtn: '放弃',
      onConfirm: () => {
        acceptVisible.value = false
        returnFor.value = ''
        returnReason.value = ''
      },
    })
    return
  }
  acceptVisible.value = false
}

function askAccept(m: Milestone) {
  confirmDialog({
    title: '验收里程碑',
    content: `确认「${m.title}」已达成交付要求？验收通过后不可撤销。`,
    cancelBtn: '取消',
    confirmBtn: '确认验收',
    onConfirm: () => void onAccept(m),
  })
}

async function onAccept(m: Milestone) {
  if (!acceptTargetId.value || actingOn.value) return
  actingOn.value = `${m.id}:accept`
  try {
    await acceptMilestone(acceptTargetId.value, m.id)
    Toast('已验收')
    await run()
    if (!pendingTargets.value.length) {
      acceptVisible.value = false
      returnFor.value = ''
    }
  } catch (e) {
    Toast(e instanceof Error ? e.message : '验收失败，请稍后重试')
  } finally {
    actingOn.value = ''
  }
}

async function onReturn(m: Milestone) {
  if (!acceptTargetId.value || actingOn.value) return
  if (!returnReason.value.trim()) {
    returnError.value = '请填写退回原因'
    Toast(returnError.value)
    return
  }
  actingOn.value = `${m.id}:return`
  try {
    await returnMilestone(acceptTargetId.value, m.id, returnReason.value.trim())
    Toast('已退回，等待承接方重新提交')
    returnFor.value = ''
    returnReason.value = ''
    await run()
    if (!pendingTargets.value.length) acceptVisible.value = false
  } catch (e) {
    Toast(e instanceof Error ? e.message : '退回失败，请稍后重试')
  } finally {
    actingOn.value = ''
  }
}

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-my-projects">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <!-- 用 :list 驱动导航 + 单一内容槽：两个标签页共用同一份列表，避免重复 DOM -->
    <Tabs
      v-else
      id="me-projects-tabs"
      v-model="activeTab"
      :list="tabList"
      class="top-tabs"
      :swipeable="false"
      :data-tab-values="JSON.stringify(['undertaken', 'initiated'])"
    >
      <div
        class="tab-panel-body"
        role="tabpanel"
        :id="`me-projects-tabs-${activeTab}-panel`"
        :aria-labelledby="`me-projects-tabs-${activeTab}-tab`"
        tabindex="0"
      >
        <EmptyBlock v-if="!activeList.length" :text="emptyText" :action-text="emptyActionText" @action="onEmptyAction" />
        <List v-else class="stagger list" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
          <p class="list-count">共 {{ formatZhNumber(activeList.length) }} 个</p>
          <!-- v52：跳转型整卡按 wiki §5 口径用 router-link 承载主体（支持 Ctrl/中键新标签、读屏播报为链接）；
               甲方验收按钮放在链接之外的操作行，避免在 <a> 内嵌套交互元素 -->
          <div v-for="p in visibleItems" :key="p.id" class="m-card project-card">
            <router-link class="project-main pressable" :to="`/me/projects/${p.id}`">
              <header class="row">
                <h2 class="name">{{ p.name }}</h2>
                <!-- v48：结项状态统一走 StateTag（kind=project），与详情页口径一致 -->
                <StateTag v-if="p.finishedAt" kind="project" value="finished" />
                <!-- v51：角色标签属中性信息，不再用表示「通过/成功」的 success 语义色（与「企业承接」同一灰阶family） -->
                <Tag v-if="p.role === '需求发起方'" theme="default" variant="light" size="small">需求发起方</Tag>
                <Tag v-else-if="p.role === '本人承接'" theme="primary" variant="light" size="small">本人承接</Tag>
                <template v-else>
                  <Tag theme="default" variant="light" size="small">企业承接</Tag>
                  <span v-if="p.enterpriseName" class="ent">{{ p.enterpriseName }}</span>
                </template>
              </header>

              <p v-if="p.partnerName" class="partner">协作方：{{ p.partnerName }}</p>

              <Progress class="progress" :percentage="p.progress" />

              <ul v-if="p.milestones.length" class="milestones">
                <li v-for="m in p.milestones" :key="m.id" class="milestone">
                  <StateTag kind="milestone" :value="milestoneTag(m)" />
                  <span class="m-title">{{ m.title }}</span>
                </li>
              </ul>
              <p v-else class="milestones-empty">暂无里程碑</p>
            </router-link>

            <div v-if="activeTab === 'initiated' && pendingCount(p)" class="project-actions">
              <Button size="small" theme="primary" @click="openAccept(p)">去验收（{{ pendingCount(p) }}）</Button>
            </div>
          </div>
        </List>
      </div>
    </Tabs>

    <!-- 验收面板：列出该项目全部待验收节点，逐个通过 / 退回 -->
    <Popup v-model:visible="acceptVisible" placement="bottom" class="accept-popup" aria-label="里程碑验收">
      <div class="accept-body">
        <div class="accept-head">
          <h2>里程碑验收</h2>
          <Button variant="text" aria-label="关闭验收" @click="closeAccept">关闭</Button>
        </div>
        <p v-if="acceptTarget" class="accept-project">{{ acceptTarget.name }}</p>
        <EmptyBlock v-if="!pendingTargets.length" text="该项目暂无待验收节点" />
        <ul v-else class="accept-list">
          <li v-for="m in pendingTargets" :key="m.id" class="accept-item">
            <div class="accept-item-head">
              <span class="accept-item-title">{{ m.title }}</span>
              <span v-if="m.submittedAt" class="accept-item-time">提交于 {{ formatLocalDateTime(m.submittedAt) }}</span>
            </div>
            <p v-if="m.attachments?.length" class="accept-item-evidence">交付证据 {{ m.attachments.length }} 张（可在项目详情查看）</p>
            <template v-if="returnFor === m.id">
              <label class="field-label">退回原因（必填）</label>
              <Textarea
                v-model="returnReason"
                :autosize="{ minRows: 2, maxRows: 4 }"
                :maxlength="120"
                placeholder="退回原因（必填）…"
              />
              <p v-if="returnError" class="field-error">{{ returnError }}</p>
            </template>
            <div class="accept-actions">
              <template v-if="returnFor === m.id">
                <Button size="small" theme="danger" variant="outline" :loading="isActing(m, 'return')" @click="onReturn(m)">
                  确认退回
                </Button>
                <Button size="small" variant="outline" :disabled="!!actingOn" @click="returnFor = ''">取消</Button>
              </template>
              <template v-else>
                <Button size="small" theme="primary" :loading="isActing(m, 'accept')" @click="askAccept(m)">验收通过</Button>
                <Button size="small" theme="danger" variant="outline" :disabled="!!actingOn" @click="returnFor = m.id">
                  退回修改
                </Button>
              </template>
            </div>
          </li>
        </ul>
        <router-link v-if="acceptTarget" class="accept-detail-link" :to="`/me/projects/${acceptTarget.id}`">
          查看项目详情与交付证据
        </router-link>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.m-my-projects {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

/* Tabs 的单一内容槽：与其余选项卡页一致，内容回到页面灰底；
 * 顶部加 16px 间距（图1/图2 反馈：列表计数「共 N 个」与空态距选项卡太近） */
.tab-panel-body {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  padding-top: var(--app-space-7);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.project-card {
  display: block;
  color: inherit;
}

.project-main {
  display: block;
  color: inherit;
  text-decoration: none;
}

/* 甲方验收入口：与卡片内容用虚线分隔，右侧对齐，命中区独立于整卡跳转 */
.project-actions {
  display: flex;
  justify-content: flex-end;
  margin-top:var(--app-space-5);
  padding-top:var(--app-space-5);
  border-top: 1px dashed var(--td-component-border);
}

.row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.name {
  flex: 1;
  margin:0;
  font: var(--app-type-card-title);
  min-width: 0;
}

.ent {
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.partner {
  margin:var(--app-space-4) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.progress {
  margin-top:var(--app-space-5);
}

.milestones {
  margin:var(--app-space-6) 0 0;
  padding:var(--app-space-5) 0 0 0;
  border-top: 1px dashed var(--td-component-border);
  list-style: none;
  display: flex;
  flex-direction: column;
  gap:var(--app-space-3);
}

.milestone {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* v48：状态文案由 StateTag 承载（图标无文案、无图例，与详情页口径不一致） */
.milestone .m-title {
  min-width: 0;
}

.milestones-empty {
  margin:var(--app-space-5) 0 0;
  padding-top:var(--app-space-5);
  border-top: 1px dashed var(--td-component-border);
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

/* ---------- 验收面板 ---------- */
.accept-popup {
  width: 100%;
}

.accept-body {
  max-height: 80dvh;
  overflow-y: auto;
  padding:var(--app-space-6) var(--app-space-7) calc(var(--app-space-6) + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.accept-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-4);
}

.accept-head h2 {
  margin:0;
  font: var(--app-type-section);
}

.accept-project {
  margin:0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
  min-width: 0;
  overflow-wrap: anywhere;
}

.accept-list {
  margin:0;
  padding:0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.accept-item {
  padding:var(--app-space-5);
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-secondarycontainer);
}

.accept-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap:var(--app-space-4);
  font: var(--app-type-card-title);
}

.accept-item-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.accept-item-time,
.accept-item-evidence {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.field-label {
  display: block;
  margin:var(--app-space-4) 0 var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

.accept-actions {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-4);
}

.accept-detail-link {
  align-self: center;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font: var(--app-type-body-sm);
  color: var(--td-brand-color);
  text-decoration: none;
}
</style>
