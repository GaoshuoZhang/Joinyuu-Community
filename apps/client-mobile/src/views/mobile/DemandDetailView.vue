<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchDemand, respondDemand } from '@/api/demands'
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

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = String(route.params.id)
const { data: demand, loading, error, run } = useAsyncList(() => fetchDemand(id))

onMounted(async () => {
  await run()
  await loadFavorite()
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
          <span class="cat">{{ demand.categoryLabel }}</span>
          <span v-if="demand.kind" class="kind">{{ DEMAND_KIND_LABELS[demand.kind] }}</span>
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
            <a class="relink" v-pressable @click="router.push(`/login?redirect=${route.fullPath}`)">登录后查看 ›</a>
          </p>
        </div>
        <p class="report-link" v-pressable @click="reportVisible = true">举报该需求</p>
        <div class="fav-row">
          <Button size="small" variant="outline" @click="onToggleFavorite">{{ favorited ? '★ 已收藏' : '☆ 收藏' }}</Button>
          <Button size="small" variant="outline" @click="onShare">分享</Button>
        </div>
      </div>

      <ReasonSheet v-model:visible="reportVisible" title="举报需求" :reasons="REPORT_REASONS" placeholder="补充说明（选填）…" submit-label="提交举报" @submit="onReport" />

      <div class="m-card">
        <h2 class="sub">响应需求</h2>
        <Button v-if="!auth.isLogged" theme="primary" block @click="router.push(`/login?redirect=${route.fullPath}`)">
          登录后响应
        </Button>
        <p v-else-if="isMine" class="notice">这是你发布的需求</p>
        <p v-else-if="responded" class="notice done">已响应过该需求</p>
        <p v-else-if="demand.status === 'projected'" class="notice done">该需求已立项，协作项目已生成</p>
        <p v-else-if="demand.status === 'rejected'" class="notice">该需求未通过审核</p>
        <p v-else-if="demand.status === 'withdrawn'" class="notice">该需求已被发布者撤回</p>
        <p v-else-if="demand.status === 'closed'" class="notice">该需求已关闭</p>
        <p v-else-if="demand.status === 'pending'" class="notice">该需求正在审核中</p>
        <template v-else>
          <Textarea v-model="note" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="请输入响应说明…" />
          <Tag
            v-if="enterpriseIdentity"
            size="medium"
            variant="light"
            :theme="asEnterprise ? 'primary' : 'default'"
            @click="asEnterprise = !asEnterprise"
          >
            以{{ enterpriseIdentity.enterpriseName ?? '社区企业' }}身份响应
          </Tag>
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
