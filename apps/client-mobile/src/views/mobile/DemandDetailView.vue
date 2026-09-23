<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { fetchDemand, fetchDemandResponses, respondDemand, selectDemandResponders } from '@/api/demands'
import { fetchMyIdentities } from '@/api/enterprises'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { shareContent } from '@/utils/share'
import { ApiError } from '@/api/http'
import { actionIdentityOptions, useAuthStore } from '@/stores/auth'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import DemandInfoCard from '@/components/demand/DemandInfoCard.vue'
import DemandOwnerResponses from '@/components/demand/DemandOwnerResponses.vue'
import DemandRespondForm from '@/components/demand/DemandRespondForm.vue'
import FlowResult from '@/components/FlowResult.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyResponseItem, UserIdentity } from '@/types'
import { formatLocalDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = String(route.params.id)
const { data: demand, loading, error, errorCode, run } = useAsyncList(() => fetchDemand(id))
/* 404（资源不存在/不可见）重试无意义：主操作改为「返回需求广场」，其余错误保留「重试」 */
const notFound = computed(() => errorCode.value === 404)

onMounted(async () => {
  await run()
  /* v48：收藏与发布者响应列表互相独立，并行拉取，避免串行 await 形成加载瀑布 */
  await Promise.all([loadFavorite(), loadOwnerResponses()])
  void loadRespondIdentities()
})

/* v37 收藏 */
const favorited = ref(false)
async function loadFavorite() {
  /* 公开路由：游客不请求收藏列表，避免 401 被统一拦截跳登录 */
  if (!auth.isLogged) return
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
  const next = !favorited.value
  favorited.value = next
  try {
    const d = demand.value
    favorited.value = await toggleFavorite('demand', id, d?.title ?? '', d?.categoryLabel)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    favorited.value = !next
    Toast(e instanceof ApiError ? e.message : '操作失败，请稍后重试')
  }
}

/* 发布者视角：响应情况与意向承接方多选（立项由社区管理员确认） */
const isMine = computed(() => !!demand.value?.publisherUid && demand.value.publisherUid === auth.uid)
const responded = computed(() => !!demand.value?.myResponse)
const cardTitle = computed(() =>
  isMine.value ? '响应情况' : responded.value ? '我的响应' : '响应需求',
)
const ownerResponses = ref<MyResponseItem[]>([])
const ownerResponsesLoading = ref(false)
const ownerResponsesError = ref(false)
const selecting = ref(false)
const submitting = ref(false)
const respondForm = ref<InstanceType<typeof DemandRespondForm> | null>(null)
const flowResult = ref<'responded' | 'selected' | null>(null)
const canSelect = computed(() => demand.value?.status === 'published')
const canViewResponses = computed(() => ['published', 'selected', 'projected'].includes(demand.value?.status ?? ''))
/* v44：响应身份选项（自有全部身份 + 被授权「响应需求」的代企业身份），单选 */
const delegatedRespondIdentities = ref<UserIdentity[]>([])
const respondIdentities = computed<UserIdentity[]>(() => {
  const own = auth.identities
  const communityEnterprises = own.filter((i) => i.type === 'community_enterprise')
  const delegated = delegatedRespondIdentities.value.filter(
    (d) => !communityEnterprises.some((c) => c.enterpriseId === d.enterpriseId),
  )
  const communityIndividuals = own.filter((i) => i.type === 'community_individual')
  const externalEnterprises = own.filter((i) => i.type === 'external_enterprise')
  const individuals = own.filter((i) => i.type === 'individual')
  return actionIdentityOptions([
    ...communityEnterprises,
    ...delegated,
    ...communityIndividuals,
    ...externalEnterprises,
    ...(individuals.length ? individuals : [{ type: 'individual' as const }]),
  ])
})

async function loadRespondIdentities() {
  if (!auth.isLogged) return
  try {
    const list = await fetchMyIdentities()
    delegatedRespondIdentities.value = list
      .filter((i) => i.type === 'community_enterprise' && i.enterpriseId && (i.isContact || (i.permissions ?? []).includes('respond_demand')))
      .map((i): UserIdentity => ({ type: 'community_enterprise', enterpriseId: i.enterpriseId, enterpriseName: i.name }))
  } catch {
    /* 接口异常时仅展示自有身份 */
  }
}

/* 响应区状态提示：同一状态对发布者（关心审核/立项进展）与浏览者（能否响应）含义不同，
 * 文案按 isMine 分支，避免把「发布者视角」的说明安到浏览者身上。
 * done 表示该状态已是终态（按成功色呈现）。 */
const STATUS_NOTICES: Record<string, { owner: string; viewer: string; done?: boolean }> = {
  pending: { owner: '审核结果将通过站内信通知', viewer: '需求正在审核中，暂不能响应' },
  pending_release: { owner: '发布后即可接受响应', viewer: '需求已通过审核，发布后即可响应' },
  scheduled: { owner: '将在设定时间自动发布', viewer: '需求将在设定时间自动发布' },
  rejected: { owner: '可修改后重新提交审核', viewer: '需求未通过审核，暂不能响应' },
  withdrawn: { owner: '可修改后重新提交审核', viewer: '需求已撤回，暂不能响应' },
  closed: { owner: '暂无可处理的响应', viewer: '需求已关闭，暂不接受响应' },
  selected: { owner: '暂不接受新响应，等待社区管理员确认立项', viewer: '已选定承接方，等待社区管理员确认立项' },
  projected: { owner: '协作项目已生成', viewer: '协作项目已生成', done: true },
}
/* 发布者侧空态文案（DemandOwnerResponses 复用同一份口径） */
const ownerEmptyNotice = computed(() => STATUS_NOTICES[demand.value?.status ?? '']?.owner ?? '暂无响应')
/* 浏览者侧状态提示：无映射（已发布）时返回 null，交给响应表单 */
const viewerNotice = computed(() => {
  const meta = STATUS_NOTICES[demand.value?.status ?? '']
  if (!meta) return null
  return { text: isMine.value ? meta.owner : meta.viewer, done: meta.done === true }
})

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

async function onSubmitSelection(ids: string[]) {
  selecting.value = true
  try {
    await selectDemandResponders(id, ids)
    flowResult.value = 'selected'
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    selecting.value = false
  }
}

async function onRespond(note: string, identity: UserIdentity) {
  submitting.value = true
  try {
    const enterpriseId = identity.type === 'community_enterprise' ? identity.enterpriseId : undefined
    await respondDemand(id, note, identity.type, enterpriseId)
    respondForm.value?.clearNote()
    flowResult.value = 'responded'
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '响应失败，请稍后重试')
  } finally {
    submitting.value = false
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
    <FlowResult
      v-if="flowResult === 'responded'"
      title="响应已提交"
      description="发布者可在响应列表中查看你的说明；后续状态将在我的响应中更新。"
      :reference="id"
      primary-text="查看我的响应"
      secondary-text="返回需求广场"
      @primary="router.replace('/me/responses')"
      @secondary="router.replace('/projects')"
    />
    <FlowResult
      v-else-if="flowResult === 'selected'"
      title="承接方已选定"
      description="需求已转为已选定，等待社区管理员确认立项。"
      :reference="id"
      primary-text="查看我的需求"
      secondary-text="返回需求广场"
      @primary="router.replace('/me/demands')"
      @secondary="router.replace('/projects')"
    />
    <ListSkeleton v-else-if="loading" />
    <template v-else-if="error">
      <EmptyBlock
        :text="error"
        :action-text="notFound ? '返回需求广场' : '重试'"
        @action="notFound ? router.replace('/projects') : run()"
      />
    </template>
    <template v-else-if="demand">
      <DemandInfoCard
        :demand="demand"
        :favorited="favorited"
        @toggle-favorite="onToggleFavorite"
        @share="onShare"
      />

      <div class="m-card">
        <h2 class="sub">{{ cardTitle }}</h2>
        <Button v-if="!auth.isLogged" theme="primary" block @click="router.push(`/login?redirect=${route.fullPath}`)">
          登录后响应
        </Button>
        <DemandOwnerResponses
          v-else-if="isMine"
          :responses="ownerResponses"
          :loading="ownerResponsesLoading"
          :error="ownerResponsesError"
          :can-select="canSelect"
          :selecting="selecting"
          :empty-notice="ownerEmptyNotice"
          :demand-status="demand.status"
          @retry="loadOwnerResponses"
          @submit="onSubmitSelection"
        />
        <div v-else-if="responded" class="responded">
          <p class="responded-head">
            <span>响应说明</span>
            <StateTag kind="response" :value="demand.myResponse?.status ?? 'pending'" />
          </p>
          <p class="responded-note">{{ demand.myResponse?.message || '—' }}</p>
          <p class="responded-meta">{{ formatLocalDateTime(demand.myResponse?.at ?? '') }}</p>
        </div>
        <p v-else-if="viewerNotice" class="notice" :class="{ done: viewerNotice.done }">{{ viewerNotice.text }}</p>
        <DemandRespondForm
          v-else
          ref="respondForm"
          :identities="respondIdentities"
          :user-name="auth.name"
          :submitting="submitting"
          @respond="onRespond"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.m-detail {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.sub {
  margin: 0 0 var(--app-space-5);
  font-size: var(--app-font-subtitle);
}

.notice {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
  border: 1px dashed var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding: var(--app-space-6) var(--app-space-7);
}

.notice.done {
  color: var(--td-success-color);
  border-style: solid;
}

.responded {
  border: 1px solid var(--td-success-color-3);
  border-radius: var(--td-radius-large);
  padding: var(--app-space-6) var(--app-space-7);
  background: var(--td-success-color-1);
}

.responded-head {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
  font-size: var(--app-font-body);
  font-weight: 600;
  color: var(--td-success-color);
}

.responded-note {
  margin: var(--app-space-4) 0 0;
  font-size: var(--app-font-body);
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.responded-meta {
  margin: var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}
</style>
