<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, List, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { fetchMyApplications, withdrawApplication } from '@/api/applications'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { ApplicationType } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyApplications)
const applications = computed(() => data.value ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(applications)
const footerState = computed(() => (hasMore.value ? 'load-more' : ''))
function loadMore() {
  if (!hasMore.value) return
  showMore()
}
function onListScroll(bottomDistance: number) {
  if (bottomDistance < 60) loadMore()
}
onMounted(run)

const typeLabel: Record<ApplicationType, string> = {
  settle: '企业入驻',
  individual: '人才登记',
  cooperation: '合作伙伴',
}

const REVISE_ROUTES: Record<ApplicationType, string> = {
  settle: '/applications/settle',
  cooperation: '/applications/cooperation',
  individual: '/applications/individual',
}

function onRevise(a: { id: string; type: ApplicationType }) {
  void router.push(`${REVISE_ROUTES[a.type]}?revise=${a.id}`)
}

function onWithdraw(a: { id: string; targetName: string }) {
  DialogPlugin.confirm({
    title: '撤回申请',
    content: `撤回后「${a.targetName}」将不再进入审核，可在列表中修改重提。`,
    cancelBtn: '取消',
    /* 破坏性操作：确认按钮用 danger 主题，避免与常规确认混淆 */
    confirmBtn: { content: '确认撤回', theme: 'danger' },
    onConfirm: async () => {
      try {
        await withdrawApplication(a.id)
        Toast('已撤回申请')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      }
    },
  })
}
</script>

<template>
  <div class="page-fade-in my-applications">
    <p class="hint">企业入驻 / 合作伙伴 / 人才登记请从首页「企业合作 · 人才登记」入口提交</p>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同 -->
    <EmptyBlock v-else-if="!applications.length" text="暂无申请记录" action-text="去提交申请" @action="router.push('/intros/enterprise')" />
    <List v-else class="stagger list" :async-loading="footerState" @load-more="loadMore" @scroll="onListScroll">
      <p class="list-count">共 {{ formatZhNumber(applications.length) }} 条</p>
      <article v-for="a in visibleItems" :key="a.id" class="m-card record-card">
        <!-- 跳转由外层链接承载，操作按钮留在链接外（键盘/读屏不再嵌套交互控件） -->
        <router-link class="record-main" :to="`/me/applications/${a.id}`">
          <div class="row">
            <span class="type">{{ typeLabel[a.type] }}</span>
            <StateTag kind="application" :value="a.status" />
          </div>
          <p class="target">{{ a.targetName }}</p>
          <p v-if="a.summary" class="summary">{{ a.summary }}</p>
          <p v-if="a.attachments?.length" class="files">附件（{{ formatZhNumber(a.attachments.length) }}）：{{ a.attachments.map((f) => f.name).join('、') }}</p>
          <p class="meta">提交于 {{ formatLocalDateTime(a.submittedAt) }}<template v-if="a.reviewedAt"> · 审核于 {{ formatLocalDateTime(a.reviewedAt) }}</template></p>
          <p v-if="a.rejectReason" class="reject">驳回原因：{{ a.rejectReason }}</p>
        </router-link>
        <div v-if="a.status === 'pending' || a.status === 'rejected' || a.status === 'withdrawn'" class="row-ops">
          <Button v-if="a.status === 'pending'" size="small" variant="outline" @click="onWithdraw(a)">撤回</Button>
          <Button v-if="a.status === 'rejected' || a.status === 'withdrawn'" size="small" theme="primary" variant="outline" @click="onRevise(a)">修改重提</Button>
        </div>
      </article>
    </List>
  </div>
</template>

<style scoped>
.my-applications {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.hint {
  margin:0 var(--app-space-1);
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-placeholder);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.record-main {
  display: block;
  color: inherit;
  text-decoration: none;
}

.record-main:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
  margin-bottom:var(--app-space-3);
}

.type {
  font-size: var(--app-font-body);
  font-weight: 600;
}

.target {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

/* 长摘要/长文件名必须能换行并在两行内截断，避免横向溢出撑破卡片 */
.summary {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-primary);
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.files {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
  overflow-wrap: anywhere;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.meta {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.reject {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.row-ops {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-4);
}
</style>
