<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Checkbox, Icon, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchDemand, fetchDemandResponses, respondDemand, selectDemandResponders } from '@/api/demands'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { shareContent } from '@/utils/share'
import { ApiError } from '@/api/http'
import { submitReport } from '@/api/reports'
import { useAuthStore } from '@/stores/auth'
import { useAsyncList } from '@/composables/useAsyncList'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ReasonSheet from '@/components/ReasonSheet.vue'
import { DEMAND_KIND_LABELS, demandDateText } from '@/constants/demand'
import type { MyResponseItem } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = String(route.params.id)
const { data: demand, loading, error, run } = useAsyncList(() => fetchDemand(id))

onMounted(async () => {
  await run()
  await loadFavorite()
  await loadOwnerResponses()
})

/* v37 收藏 */
const favorited = ref(false)
async function loadFavorite() {
  try {
    const list = await listFavorites()
    favorited.value = list.some((item) => item.type === 'demand' && item.targetId === id)
  } catch {
    favorited.value = false
  }
}

async function onToggleFavorite() {
  if (!auth.isLogged) {
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  try {
    const d = demand.value
    favorited.value = await toggleFavorite('demand', id, d?.title ?? '', d?.categoryLabel)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '操作失败，请稍后重试')
  }
}

const note = ref('')
/* v42：以社区企业身份响应（成员拥有 respond_demand 权限） */
const enterpriseIdentity = computed(() => auth.profileIdentities.find((i) => i.type === 'community_enterprise' && i.enterpriseId))
const asEnterprise = ref(false)
const noteError = ref('')
watch(note, () => (noteError.value = ''))
const submitting = ref(false)
const isMine = computed(() => !!demand.value?.publisherUid && demand.value.publisherUid === auth.uid)
const responded = computed(() => !!demand.value?.myResponse)
/* 响应状态文案（与服务端 DemandRespondent.status 对齐） */
const RESPONSE_STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  contacted: '已联系',
  accepted: '已接受',
  rejected: '已驳回',
  closed: '已结束',
}
const responseStatusLabel = computed(() => RESPONSE_STATUS_LABELS[demand.value?.myResponse?.status ?? ''] ?? '')

/* 发布者视角：响应情况与意向承接方多选（立项由社区管理员确认） */
const cardTitle = computed(() =>
  isMine.value ? '响应情况' : responded.value ? '我的响应' : '响应需求',
)

const ownerResponses = ref<MyResponseItem[]>([])
const ownerResponsesLoading = ref(false)
const ownerResponsesError = ref(false)
const selection = ref<string[]>([])
const selecting = ref(false)
const canSelect = computed(() => demand.value?.status === 'published')
const canViewResponses = computed(() => ['published', 'selected', 'projected'].includes(demand.value?.status ?? ''))

const OWNER_EMPTY_NOTICES: Record<string, string> = {
  pending: '该需求正在审核中',
  pending_release: '需求已通过审核，待发布',
  scheduled: '需求已安排定时发布',
  rejected: '该需求未通过审核',
  withdrawn: '该需求已撤回',
  closed: '该需求已关闭',
  projected: '该需求已立项',
}
const ownerEmptyNotice = computed(() => OWNER_EMPTY_NOTICES[demand.value?.status ?? ''] ?? '暂无响应')

async function loadOwnerResponses() {
  if (!isMine.value || !canViewResponses.value) return
  ownerResponsesLoading.value = true
  ownerResponsesError.value = false
  try {
    ownerResponses.value = await fetchDemandResponses(id)
  } catch {
    ownerResponsesError.value = true
  } finally {
    ownerResponsesLoading.value = false
  }
}

function toggleSelection(responseId: string) {
  const index = selection.value.indexOf(responseId)
  if (index >= 0) selection.value.splice(index, 1)
  else selection.value.push(responseId)
}

async function onSubmitSelection() {
  if (!selection.value.length) {
    Toast('请至少选择一位意向承接方')
    return
  }
  selecting.value = true
  try {
    await selectDemandResponders(id, [...selection.value])
    Toast('已提交，等待社区管理员确认立项')
    selection.value = []
    await run()
    await loadOwnerResponses()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    selecting.value = false
  }
}

async function onRespond() {
  if (!note.value.trim()) {
    noteError.value = '请输入响应说明'
    Toast(noteError.value)
    return
  }
  submitting.value = true
  try {
    await respondDemand(id, note.value.trim(), asEnterprise.value ? enterpriseIdentity.value?.enterpriseId : undefined)
    Toast('响应成功，积分 +20')
    note.value = ''
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '响应失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* v35：联系方式仅登录可见；支持举报 */
const reportVisible = ref(false)
const REPORT_REASONS = ['信息不实', '联系方式不实', '违规 / 不良信息', '骚扰 / 广告', '其他']

async function onReport(text: string) {
  if (!text) return void Toast('请选择举报原因')
  try {
    await submitReport({ targetType: 'demand', targetId: id, targetTitle: demand.value?.title ?? '', reason: text })
    Toast('举报已提交，运营将核实处理')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '举报提交失败，请稍后重试')
  }
}

/* v40：分享 */
async function onShare() {
  const item = demand.value
  if (!item) return
  await shareContent({ title: item.title, text: item.description })
}
</script>

<template>
  <div class="m-detail page-fade-in stagger">
    <Loading v-if="loading" class="state" text="加载中…" />
    <template v-else-if="error">
      <EmptyBlock :text="error" action-text="重试" @action="run" />
    </template>
    <template v-else-if="demand">
      <div class="m-card">
        <div class="head">
          <h1 class="title">{{ demand.title }}</h1>
          <StateTag kind="demand" :value="demand.status" />
        </div>
        <div class="meta">
          <Tag class="cat" size="small" variant="light" theme="primary">{{ demand.categoryLabel }}</Tag>
          <Tag v-if="demand.kind" class="kind" size="small" variant="light" theme="default">{{ DEMAND_KIND_LABELS[demand.kind] }}</Tag>
          <span class="pub">
            <IdentityTag :type="demand.publisherIdentity" />
            <span class="pub-name">{{ demand.publisherName }}</span>
          </span>
        </div>
        <p class="deadline">
          <span v-if="demandDateText(demand)">{{ demandDateText(demand) }} · </span>{{ demand.responseCount }} 人响应
        </p>
        <p class="desc">{{ demand.description }}</p>
        <div v-if="demand.kind === 'task' && (demand.deliverable || demand.budget)" class="extras">
          <p v-if="demand.deliverable"><b>期望交付：</b>{{ demand.deliverable }}</p>
          <p v-if="demand.budget"><b>预算范围：</b>{{ demand.budget }}</p>
        </div>
        <div v-else-if="demand.kind === 'investment' && (demand.cooperationNeed || demand.returnOffer)" class="extras">
          <p v-if="demand.cooperationNeed"><b>希望获得：</b>{{ demand.cooperationNeed }}</p>
          <p v-if="demand.returnOffer"><b>可提供回报：</b>{{ demand.returnOffer }}</p>
        </div>
        <div
          v-else-if="demand.kind === 'cooperation' && (demand.bottleneck || demand.partnershipMode || demand.returnOffer)"
          class="extras"
        >
          <p v-if="demand.bottleneck"><b>合作诉求：</b>{{ demand.bottleneck }}</p>
          <p v-if="demand.partnershipMode"><b>期望合作方式：</b>{{ demand.partnershipMode }}</p>
          <p v-if="demand.returnOffer"><b>可提供资源：</b>{{ demand.returnOffer }}</p>
        </div>

        <div v-if="auth.isLogged && (demand.contactName || demand.contactPhone || demand.contactEmail)" class="extras">
          <p v-if="demand.contactName"><b>联系人：</b>{{ demand.contactName }}</p>
          <p v-if="demand.contactPhone"><b>联系电话：</b>{{ demand.contactPhone }}</p>
          <p v-if="demand.contactEmail"><b>联系邮箱：</b>{{ demand.contactEmail }}</p>
        </div>
        <div v-else-if="!auth.isLogged && (demand.contactName || demand.contactPhone || demand.contactEmail)" class="extras">
          <p class="contact-locked">
            联系方式仅对登录用户可见
            <a class="relink" v-pressable @click="router.push(`/login?redirect=${route.fullPath}`)">登录后查看<Icon name="chevron-right" size="12px" /></a>
          </p>
        </div>
        <p class="report-link" v-pressable @click="reportVisible = true">举报该需求</p>
        <div class="fav-row">
          <Button size="small" variant="outline" @click="onToggleFavorite">
            <Icon :name="favorited ? 'star-filled' : 'star'" size="16px" />{{ favorited ? '已收藏' : '收藏' }}
          </Button>
          <Button size="small" variant="outline" @click="onShare"><Icon name="share" size="16px" />分享</Button>
        </div>
      </div>

      <ReasonSheet v-model:visible="reportVisible" title="举报需求" :reasons="REPORT_REASONS" placeholder="补充说明（选填）…" submit-label="提交举报" @submit="onReport" />

      <div class="m-card">
        <h2 class="sub">{{ cardTitle }}</h2>
        <Button v-if="!auth.isLogged" theme="primary" block @click="router.push(`/login?redirect=${route.fullPath}`)">
          登录后响应
        </Button>
        <template v-else-if="isMine">
          <p v-if="ownerResponsesLoading" class="owner-loading">响应加载中…</p>
          <p v-else-if="ownerResponsesError" class="owner-error">
            响应加载失败
            <a class="relink" v-pressable @click="loadOwnerResponses">重试</a>
          </p>
          <template v-else>
            <p v-if="!ownerResponses.length" class="notice">{{ ownerEmptyNotice }}</p>
            <template v-else>
              <div
                v-for="r in ownerResponses"
                :key="r.id"
                class="owner-response"
                :class="{ 'is-chosen': r.status === 'accepted' }"
              >
                <div class="owner-response-head">
                  <strong>{{ r.responderName ?? '响应方' }}</strong>
                  <span class="owner-response-state">{{ RESPONSE_STATUS_LABELS[r.status ?? 'pending'] ?? '' }}</span>
                </div>
                <p class="owner-response-note">{{ r.note }}</p>
                <p class="owner-response-meta">{{ r.at }}</p>
                <Button
                  v-if="canSelect && (r.status ?? 'pending') === 'pending'"
                  size="small"
                  variant="outline"
                  :theme="selection.includes(r.id) ? 'primary' : 'default'"
                  @click="toggleSelection(r.id)"
                >
                  {{ selection.includes(r.id) ? '已选择' : '选择为意向承接方' }}
                </Button>
                <span v-else-if="r.status === 'accepted'" class="owner-chosen">已选定</span>
              </div>
              <p v-if="canSelect" class="selection-tip">可多选意向承接方；提交后需求转为「已选定」，由社区管理员确认后立项</p>
              <Button
                v-if="canSelect"
                theme="primary"
                block
                class="submit-btn"
                :disabled="!selection.length"
                :loading="selecting"
                @click="onSubmitSelection"
              >
                提交立项{{ selection.length ? `（已选 ${selection.length} 项）` : '' }}
              </Button>
              <p v-else-if="demand.status === 'selected'" class="notice done">已选定承接方，等待社区管理员确认立项</p>
            </template>
          </template>
        </template>
        <div v-else-if="responded" class="responded">
          <p class="responded-head">已响应该需求</p>
          <p class="responded-note">{{ demand.myResponse?.message || '—' }}</p>
          <p class="responded-meta">
            {{ demand.myResponse?.at }}
            <template v-if="responseStatusLabel"> · {{ responseStatusLabel }}</template>
          </p>
        </div>
        <p v-else-if="demand.status === 'projected'" class="notice done">该需求已立项，协作项目已生成</p>
        <p v-else-if="demand.status === 'selected'" class="notice">发布者已选定意向承接方，暂不接受新响应</p>
        <p v-else-if="demand.status === 'pending_release'" class="notice">该需求待发布，暂不接受响应</p>
        <p v-else-if="demand.status === 'scheduled'" class="notice">该需求已安排定时发布，暂不接受响应</p>
        <p v-else-if="demand.status === 'rejected'" class="notice">该需求未通过审核</p>
        <p v-else-if="demand.status === 'withdrawn'" class="notice">该需求已被发布者撤回</p>
        <p v-else-if="demand.status === 'closed'" class="notice">该需求已关闭</p>
        <p v-else-if="demand.status === 'pending'" class="notice">该需求正在审核中</p>
        <template v-else>
          <Textarea v-model="note" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="请输入响应说明…" />
          <Checkbox
            v-if="enterpriseIdentity"
            :checked="asEnterprise"
            :label="`以${enterpriseIdentity.enterpriseName ?? '社区企业'}身份响应`"
            @change="asEnterprise = Boolean($event)"
          />
          <p v-if="noteError" class="field-error">{{ noteError }}</p>
          <Button theme="primary" block class="submit-btn" :loading="submitting" @click="onRespond">响应需求</Button>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.m-detail {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 17px;
  line-height: 1.45;
  flex: 1;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cat,
.kind {
  flex-shrink: 0;
}

.extras {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--td-component-border);
}

.extras p {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.extras p:last-child {
  margin-bottom: 0;
}

.extras b {
  color: var(--td-text-color-primary);
  font-weight: 600;
}

.contact-locked {
  color: var(--td-text-color-placeholder);
}

.relink {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  color: var(--td-brand-color);
  cursor: pointer;
}

.report-link {
  margin: 10px 0 0;
  padding-top: 10px;
  border-top: 1px dashed var(--td-component-border);
  text-align: right;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
}

.fav-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.pub {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.deadline {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.desc {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.sub {
  margin: 0 0 10px;
  font-size: 15px;
}

.notice {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
  border: 1px dashed var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding: 12px 14px;
}

.notice.done {
  color: var(--td-success-color);
  border-style: solid;
}

.responded {
  border: 1px solid var(--td-success-color-3);
  border-radius: var(--td-radius-large);
  padding: 12px 14px;
  background: var(--td-success-color-1);
}

.responded-head {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--td-success-color);
}

.responded-note {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.responded-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.owner-loading {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.owner-error {
  margin: 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.owner-response {
  padding: 12px 14px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-page);
}

.owner-response + .owner-response {
  margin-top: 10px;
}

.owner-response.is-chosen {
  border-color: var(--td-success-color-3);
  background: var(--td-success-color-1);
}

.owner-response-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.owner-response-state {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.owner-response-note {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.owner-response-meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.owner-chosen {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-success-color);
}

.selection-tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.submit-btn {
  margin-top: 10px;
}
</style>

<style scoped>
.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}
</style>
