<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Input, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchDemandResponses, fetchMyDemands, reviewDemandResponse, withdrawDemand, appealDemand } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import ReasonSheet from '@/components/ReasonSheet.vue'
import { DEMAND_KIND_LABELS } from '@/constants/demand'
import type { DemandKind, MyDemandItem, MyResponseItem } from '@/types'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyDemands)

const items = computed(() => data.value ?? [])
const responses = reactive<Record<string, MyResponseItem[]>>({})
const rejectReasons = reactive<Record<string, string>>({})
const responseFilters = reactive<Record<string, 'all' | 'pending' | 'accepted' | 'rejected'>>({})
const RESPONSE_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'accepted', label: '已接受' },
  { value: 'rejected', label: '已驳回' },
] as const

function responseList(id: string): MyResponseItem[] {
  const list = responses[id] ?? []
  const filter = responseFilters[id] ?? 'all'
  return filter === 'all' ? list : list.filter((item) => (item.status ?? 'pending') === filter)
}

function setResponseFilter(id: string, value: 'all' | 'pending' | 'accepted' | 'rejected') {
  responseFilters[id] = value
}

const REVISE_ROUTES: Record<DemandKind, string> = {
  task: '/demands/new/task',
  investment: '/demands/new/invest',
  cooperation: '/demands/new/cooperation',
}

function onRevise(d: MyDemandItem) {
  void router.push(`${REVISE_ROUTES[d.kind ?? 'task']}?revise=${d.id}`)
}

function onWithdrawDemand(d: MyDemandItem) {
  DialogPlugin.confirm({
    title: '撤回需求',
    content: `撤回后「${d.title}」将不再进入审核，可在列表中修改重提。`,
    cancelBtn: '取消',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      try {
        await withdrawDemand(d.id)
        Toast('已撤回需求')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      }
    },
  })
}

/* v35 驳回申诉 */
const appealVisible = ref(false)
const appealTarget = ref<MyDemandItem | null>(null)

function onAppeal(d: MyDemandItem) {
  appealTarget.value = d
  appealVisible.value = true
}

async function submitAppeal(text: string) {
  const target = appealTarget.value
  if (!target) return
  if (!text) {
    Toast('请填写申诉理由')
    return
  }
  try {
    await appealDemand(target.id, text)
    Toast('申诉已提交，运营将复核')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '申诉提交失败，请稍后重试')
  }
}

/* v38：并行加载响应，单条失败不影响其他需求；加载态与错误态按需求维度记录 */
const responseFailed = reactive<Record<string, boolean>>({})
const responseBusy = ref(false)

async function loadResponses() {
  const targets = items.value.filter((item) => item.status === 'published' && item.responseCount > 0)
  responseBusy.value = targets.length > 0
  await Promise.all(
    targets.map(async (demand) => {
      try {
        responses[demand.id] = await fetchDemandResponses(demand.id)
        responseFailed[demand.id] = false
      } catch {
        responses[demand.id] = []
        responseFailed[demand.id] = true
      }
    }),
  )
  responseBusy.value = false
}

onMounted(async () => {
  await run()
  await loadResponses()
})

/** v38：处理中禁止重复点击（同一响应 id 维度） */
const processingId = ref('')

async function processResponse(demandId: string, responseId: string, action: 'accept' | 'reject') {
  const reason = rejectReasons[responseId]?.trim() ?? ''
  if (action === 'reject' && !reason) {
    Toast('请输入驳回原因')
    return
  }
  if (processingId.value) return
  processingId.value = responseId
  try {
    await reviewDemandResponse(demandId, responseId, action, reason)
    Toast(action === 'accept' ? '已接受响应，项目已立项' : '响应已驳回')
    await run()
    await loadResponses()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '处理响应失败，请稍后重试')
  } finally {
    processingId.value = ''
  }
}

function rejectResponse(demandId: string, response: MyResponseItem) {
  DialogPlugin.confirm({
    title: '驳回响应',
    content: `确认驳回「${response.responderName ?? '该响应方'}」对需求「${response.demandTitle}」的响应？`,
    cancelBtn: '取消',
    confirmBtn: '确认驳回',
    onConfirm: () => void processResponse(demandId, response.id, 'reject'),
  })
}

function acceptResponse(demandId: string, response: MyResponseItem) {
  DialogPlugin.confirm({
    title: '接受响应',
    content: `接受「${response.responderName ?? '该响应方'}」后，需求将转为已立项并生成协作项目。`,
    cancelBtn: '取消',
    confirmBtn: '确认接受',
    onConfirm: () => void processResponse(demandId, response.id, 'accept'),
  })
}
</script>

<template>
  <div class="m-my-demands page-fade-in">
    <Button theme="primary" block class="publish" @click="router.push('/demands/new')">发布需求</Button>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="items.length === 0">
      <EmptyBlock text="暂无需求，去发布第一条" />
      <Button theme="primary" block @click="router.push('/demands/new')">发布需求</Button>
    </template>
    <div v-else class="list stagger">
      <p class="list-count">共 {{ items.length }} 条需求</p>
      <article v-for="d in items" :key="d.id" class="demand-row m-card">
        <div class="row-head">
          <h3 class="row-title">{{ d.title }}</h3>
          <StateTag kind="demand" :value="d.status" />
        </div>
        <div class="row-meta">
          <span v-if="d.kind" class="kind">{{ DEMAND_KIND_LABELS[d.kind] }}</span>
          <span class="cat">{{ d.categoryLabel }}</span>
          <span>{{ d.responseCount }} 人响应</span>
        </div>
        <p class="row-time">发布于 {{ d.createdAt }}</p>
        <p v-if="d.rejectReason" class="reject">驳回原因：{{ d.rejectReason }}</p>
        <p v-if="d.status === 'rejected' && d.appealed" class="appealed">已提交申诉{{ d.appealReason ? `：${d.appealReason}` : '' }}</p>
        <div v-if="d.status === 'pending' || d.status === 'rejected' || d.status === 'withdrawn'" class="row-ops">
          <Button v-if="d.status === 'pending'" size="small" variant="outline" @click.stop="onWithdrawDemand(d)">撤回</Button>
          <Button v-if="d.status === 'rejected' && !d.appealed" size="small" variant="outline" @click.stop="onAppeal(d)">申诉</Button>
          <Button v-if="d.status === 'rejected' || d.status === 'withdrawn'" size="small" theme="primary" variant="outline" @click.stop="onRevise(d)">修改重提</Button>
        </div>
        <section v-if="d.status === 'published' && d.responseCount > 0" class="responses">
          <div class="responses-head"><strong>收到的响应</strong><span v-if="responseBusy && responses[d.id] === undefined">加载中…</span></div>
          <p v-if="responseFailed[d.id]" class="response-error">
            响应加载失败
            <a @click="loadResponses">重试</a>
          </p>
          <div v-if="(responses[d.id] ?? []).length > 1" class="response-filters">
            <Tag
              v-for="f in RESPONSE_FILTERS"
              :key="f.value"
              :theme="(responseFilters[d.id] ?? 'all') === f.value ? 'primary' : 'default'"
              variant="light"
              size="medium"
              @click="setResponseFilter(d.id, f.value)"
            >
              {{ f.label }}
            </Tag>
          </div>
          <div v-for="r in responseList(d.id)" :key="r.id" class="response-card">
            <div class="response-top">
              <strong>{{ r.responderName ?? '响应方' }}</strong>
              <StateTag kind="demand" :value="r.status === 'accepted' ? 'projected' : (r.status ?? 'pending')" />
            </div>
            <p class="response-note">{{ r.note }}</p>
            <p v-if="r.rejectReason" class="response-reject">{{ r.rejectReason }}</p>
            <template v-if="r.status === 'pending'">
              <Input v-model="rejectReasons[r.id]" :maxlength="80" placeholder="驳回原因（驳回时必填）" clearable />
              <div class="response-actions">
                <Button size="small" theme="primary" :disabled="processingId === r.id" @click.stop="acceptResponse(d.id, r)">接受并立项</Button>
                <Button size="small" theme="danger" variant="outline" :disabled="processingId === r.id" @click.stop="rejectResponse(d.id, r)">驳回</Button>
              </div>
            </template>
          </div>
        </section>
      </article>
    </div>

    <ReasonSheet v-model:visible="appealVisible" title="需求申诉" placeholder="请说明申诉理由（如已按要求补充材料、驳回原因与事实不符等）…" :maxlength="300" submit-label="提交申诉" @submit="submitAppeal" />
  </div>
</template>

<style scoped>
.m-my-demands {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.row-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
}

.row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cat {
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.kind {
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--td-radius-small);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
}

.row-time {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.reject {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.row-ops {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.appealed {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-warning-color);
}

.responses {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--td-component-border);
}

.responses-head,
.response-top,
.response-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.responses-head {
  font-size: 13px;
}

.responses-head span {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.response-card {
  margin-top: 8px;
  padding: 10px;
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-secondarycontainer);
}

.response-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.response-top {
  font-size: 12px;
}

.response-note,
.response-reject {
  margin: 6px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}

.response-reject {
  color: var(--td-error-color);
}

.response-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.response-error a {
  margin-left: 6px;
  color: var(--td-brand-color);
  cursor: pointer;
}

.response-actions {
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
