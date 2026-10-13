<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, CheckTag, Icon, Input, Loading, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { createDemand, fetchMyDemandPayload, resubmitDemand } from '@/api/demands'
import { fetchMyIdentities } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import { actionIdentityOptions, useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useDict } from '@/composables/useDict'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { useBusinessNow } from '@/composables/useBusinessNow'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import IdentityPicker from '@/components/forms/IdentityPicker.vue'
import ContactFields from '@/components/forms/ContactFields.vue'
import DemandKindExtras from '@/components/forms/DemandKindExtras.vue'
import FlowResult from '@/components/FlowResult.vue'
import { DEMAND_KINDS } from '@/constants/demand'
import type { DemandCreatePayload, DemandKind, IdentityType, UserIdentity } from '@/types'
import { formatLocalDate } from '@/utils/format'

/* 需求发布表单（schema 由 kind 决定：找服务 / 找投资 / 找合作），提交即 pending。
 * 发布身份仅作为归属（发布后列表展示的发布方），在表单内单选；
 * 联系信息供响应方联系，task 另有「预期交付日期」。 */

const props = defineProps<{ kind: DemandKind }>()
const kindMeta = computed(() => DEMAND_KINDS.find((k) => k.kind === props.kind) ?? DEMAND_KINDS[0])
const isTask = computed(() => props.kind === 'task')
const isInvest = computed(() => props.kind === 'investment')

/** 三类需求的字段文案 */
const labels = computed(() =>
  isTask.value
    ? { title: '需求标题', titlePh: '一句话描述你的需求', desc: '需求描述', descPh: '补充背景、期望的交付形式与合作方式…', cat: '需求类别' }
    : isInvest.value
      ? { title: '需求名称', titlePh: '一句话描述你的需求', desc: '需求简介', descPh: '介绍需求背景、当前进展与团队情况…', cat: '所属行业' }
      : { title: '合作需求标题', titlePh: '一句话概括你的合作需求', desc: '业务现状与瓶颈', descPh: '说说当前业务进展、遇到的瓶颈与期望的合作方向…', cat: '合作领域' },
)

const router = useRouter()
const route = useRoute()
/** v34 修改重提：携带 ?revise=<需求 id> 进入本表单 */
const reviseId = String(route.query.revise ?? '')
const revising = computed(() => !!reviseId)
const auth = useAuthStore()
const config = useConfigStore()
const { items: dictItems, loading: dictLoading, error: dictError, reload: reloadDict } = useDict(isInvest.value ? 'industry' : 'demand_category')

/** 发布身份选项：持「社区个体」时不再单列「个人用户」；含成员被授权「发布需求」的企业（代企业发布） */
const delegatedIdentities = ref<UserIdentity[]>([])
const identityOptions = computed(() => {
  const base = auth.identities
  const extra = delegatedIdentities.value.filter(
    (d) => !base.some((b) => b.type === 'community_enterprise' && b.enterpriseId === d.enterpriseId),
  )
  return actionIdentityOptions([...base, ...extra])
})

function pickIdentity(i: UserIdentity) {
  form.asIdentity = i.type
  form.asEnterpriseId = i.type === 'community_enterprise' ? (i.enterpriseId ?? '') : ''
}

const demandOpen = ref(true)
const submitting = ref(false)
const submittedId = ref('')
const showDeliverBy = ref(false)
/** 预期交付日期下限 = 今天（Picker 无值时回落到 start，默认 start 为 10 年前） */
const businessNowMs = useBusinessNow()
const todayStr = computed(() => formatLocalDate(businessNowMs.value))
const form = reactive({
  title: '',
  description: '',
  categoryCode: '',
  deliverable: '',
  budget: '',
  cooperationNeed: '',
  bottleneck: '',
  partnershipMode: '',
  returnOffer: '',
  deliverBy: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  asIdentity: (identityOptions.value[0]?.type ?? '') as IdentityType | '',
  asEnterpriseId: '',
})

function ensureVisibleIdentitySelection() {
  const selected = identityOptions.value.some(
    (identity) => identity.type === form.asIdentity
      && (identity.type !== 'community_enterprise' || identity.enterpriseId === form.asEnterpriseId),
  )
  if (selected) return
  const first = identityOptions.value[0]
  if (first) pickIdentity(first)
  else {
    form.asIdentity = ''
    form.asEnterpriseId = ''
  }
}

watch(identityOptions, ensureVisibleIdentitySelection, { deep: true })
const loaded = ref(false)
/* 修改重提：原需求数据加载期间渲染骨架，避免用户先填后被回填覆盖（无声吞掉输入） */
const payloadLoading = ref(false)
const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify(form))
useUnsavedGuard(() => loaded.value && !submittedId.value && formSnapshot.value !== baseline.value)

onMounted(async () => {
  await config.ensureLoaded()
  demandOpen.value = config.config.demandOpen
  if (!auth.isLogged) return
  try {
    const list = await fetchMyIdentities()
    delegatedIdentities.value = list
      .filter((i) => i.type === 'community_enterprise' && i.enterpriseId && (i.isContact || (i.permissions ?? []).includes('publish_demand')))
      .map((i): UserIdentity => ({ type: 'community_enterprise', enterpriseId: i.enterpriseId, enterpriseName: i.name }))
  } catch {
    /* 未登录或接口异常时仅展示自有身份 */
  }
  if (reviseId) {
    payloadLoading.value = true
    try {
      const p = await fetchMyDemandPayload(reviseId)
      form.title = p.title
      form.description = p.description
      form.categoryCode = p.categoryCode
      form.deliverable = p.deliverable ?? ''
      form.budget = p.budget ?? ''
      form.deliverBy = p.deliverBy ?? ''
      form.cooperationNeed = p.cooperationNeed ?? ''
      form.returnOffer = p.returnOffer ?? ''
      form.bottleneck = p.bottleneck ?? ''
      form.partnershipMode = p.partnershipMode ?? ''
      form.contactName = p.contactName
      form.contactPhone = p.contactPhone
      form.contactEmail = p.contactEmail ?? ''
      form.asIdentity = p.asIdentity
      form.asEnterpriseId = p.asEnterpriseId ?? ''
      ensureVisibleIdentitySelection()
    } catch (e) {
      Toast(e instanceof ApiError ? e.message : '加载原需求失败')
    } finally {
      payloadLoading.value = false
    }
    baseline.value = formSnapshot.value
    loaded.value = true
    return
  }
  baseline.value = formSnapshot.value
  loaded.value = true
})

/* v38：行内校验（长表单 Toast 消失后用户找不到出错字段）
 * v48：改为一处口径 + 手动定位 + 修正清错（本页保留自造字段容器，未迁移 t-form） */
const errors = reactive({
  title: '', description: '', category: '', deliverable: '', deliverBy: '',
  cooperationNeed: '', bottleneck: '', contactName: '', contactPhone: '', contactEmail: '',
})
type FieldKey = keyof typeof errors

/** 逐字段校验：提交与「修正后清错」共用同一份规则，避免两处口径漂移 */
function fieldErrors(): { key: FieldKey; message: string }[] {
  const list: { key: FieldKey; message: string }[] = []
  const check = (key: FieldKey, invalid: boolean, message: string) => {
    if (invalid) list.push({ key, message })
  }
  check('title', !form.title.trim(), `请输入${labels.value.title}`)
  check('description', !form.description.trim(), `请输入${labels.value.desc}`)
  check('category', !form.categoryCode, `请选择${labels.value.cat}`)
  check('deliverable', isTask.value && !form.deliverable.trim(), '请输入期望交付')
  check('deliverBy', isTask.value && !form.deliverBy, '请选择预期交付日期')
  check('cooperationNeed', isInvest.value && !form.cooperationNeed.trim(), '请输入希望获得的投资 / 合作')
  check('bottleneck', !isTask.value && !isInvest.value && !form.bottleneck.trim(), '请描述业务瓶颈与合作诉求')
  check('contactName', !form.contactName.trim(), '请输入联系人')
  check('contactPhone', !/^1\d{10}$/.test(form.contactPhone.trim()), '请输入 11 位手机号')
  check('contactEmail', !!form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim()), '请输入有效邮箱，如 name@example.com')
  return list
}

/* 长表单：Toast 一闪而过后仍要能定位到出错字段（等价于 t-form 的 scroll-to-first-error）。
 * 字段容器用 data-field 标记；DemandKindExtras 内部字段不可单独标记，用 data-field-group 指向整块。 */
function scrollToField(key: FieldKey) {
  document
    .querySelector<HTMLElement>(`[data-field="${key}"], [data-field-group~="${key}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/* v48：行内错误随用户修正即时清除——只清已恢复合法的字段，不提前抛出尚未提交过的错误 */
watch(
  form,
  () => {
    const invalid = new Set(fieldErrors().map((item) => item.key))
    ;(Object.keys(errors) as FieldKey[]).forEach((key) => {
      if (!invalid.has(key)) errors[key] = ''
    })
  },
  { deep: true },
)

async function onSubmit() {
  const list = fieldErrors()
  ;(Object.keys(errors) as FieldKey[]).forEach((key) => { errors[key] = '' })
  list.forEach((item) => { errors[item.key] = item.message })
  if (list.length) {
    Toast(list[0].message)
    scrollToField(list[0].key)
    return
  }
  if (!form.asIdentity) {
    Toast('请选择发布身份')
    return
  }
  const payload: DemandCreatePayload = {
    kind: props.kind,
    title: form.title.trim(),
    description: form.description.trim(),
    categoryCode: form.categoryCode,
    categoryDict: isInvest.value ? 'industry' : 'demand_category',
    asIdentity: form.asIdentity,
    ...(form.asIdentity === 'community_enterprise' && form.asEnterpriseId ? { asEnterpriseId: form.asEnterpriseId } : {}),
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    contactEmail: form.contactEmail.trim() || undefined,
    ...(isTask.value
      ? { deliverable: form.deliverable.trim(), budget: form.budget.trim() || undefined, deliverBy: form.deliverBy }
      : isInvest.value
        ? { cooperationNeed: form.cooperationNeed.trim(), returnOffer: form.returnOffer.trim() || undefined }
        : {
            bottleneck: form.bottleneck.trim(),
            partnershipMode: form.partnershipMode.trim() || undefined,
            returnOffer: form.returnOffer.trim() || undefined,
          }),
  }
  submitting.value = true
  try {
    if (revising.value) {
      await resubmitDemand(reviseId, payload)
      submittedId.value = reviseId
    } else {
      const result = await createDemand(payload)
      submittedId.value = result.id
    }
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="m-demand-form page-fade-in">
    <FlowResult
      v-if="submittedId"
      :title="revising ? '已重新提交审核' : '需求已提交审核'"
      description="审核结果将通过站内信通知；通过后会进入待发布阶段。"
      :reference="submittedId"
      primary-text="查看我的需求"
      secondary-text="返回需求广场"
      @primary="router.replace('/me/demands')"
      @secondary="router.replace('/projects')"
    />
    <div v-if="!demandOpen">
      <EmptyBlock text="发布功能暂未开放" />
    </div>

    <template v-else-if="payloadLoading">
      <!-- 修改重提加载原需求中：骨架占位，加载完成后表单才允许编辑 -->
      <ListSkeleton :rows="4" />
    </template>
    <template v-else-if="!submittedId">
      <p v-if="revising" class="revision-label">修改重提</p>
      <p class="subtitle">{{ revising ? '修改后将重新进入审核队列' : '提交后进入审核，通过后展示在需求列表' }}</p>

      <div class="flow m-card">
        <span class="flow-label">发布后推进流程</span>
        <div class="flow-steps">
          <template v-for="(s, i) in kindMeta.process" :key="s">
            <Tag class="flow-step" size="small" variant="light" theme="primary">{{ s }}</Tag>
            <Icon aria-hidden="true" v-if="i < kindMeta.process.length - 1" name="chevron-right" size="12px" class="flow-arrow" />
          </template>
        </div>
      </div>

      <!-- v48：保留自造字段容器（DemandKindExtras 等子字段无法低成本迁移到 FormItem），
           但补齐必填标识、错误定位与修正清错；主操作放入 form 内以支持回车提交 -->
      <form class="demand-form" @submit.prevent="onSubmit">
      <div class="field" data-field="title">
        <label>{{ labels.title }}<span class="req"> *</span></label>
        <Input v-model="form.title" :maxlength="50" :placeholder="labels.titlePh" clearable />
        <p v-if="errors.title" class="field-error">{{ errors.title }}</p>
      </div>

      <div class="field" data-field="description">
        <label>{{ labels.desc }}<span class="req"> *</span></label>
        <Textarea v-model="form.description" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="1000" :placeholder="labels.descPh" />
        <p v-if="errors.description" class="field-error">{{ errors.description }}</p>
      </div>

      <div class="field" data-field="category">
        <span class="field-label">{{ labels.cat }}<span class="req"> *</span></span>
        <!-- v48：字典加载中给占位，避免字段区空白被误读为「无可选项」 -->
        <Loading v-if="dictLoading" class="dict-loading" text="加载中…" />
        <div v-else class="chips">
          <CheckTag
            v-for="c in dictItems"
            :key="c.code"
            variant="light"
            size="medium"
            :checked="form.categoryCode === c.code"
            @change="form.categoryCode = c.code"
          >
            {{ c.label }}
          </CheckTag>
        </div>
        <p v-if="dictError" class="field-error">
          {{ labels.cat }}加载失败
          <Button class="dict-retry" size="small" variant="text" theme="danger" @click="reloadDict">重试</Button>
        </p>
        <p v-else-if="errors.category" class="field-error">{{ errors.category }}</p>
      </div>

      <!-- 类型扩展字段由 DemandKindExtras 内部渲染，无法逐个标记，整块作为定位锚点 -->
      <div data-field-group="deliverable deliverBy cooperationNeed bottleneck">
        <DemandKindExtras
          :kind="kind"
          :errors="errors"
          :today-str="todayStr"
          v-model:show-deliver-by="showDeliverBy"
          v-model:deliverable="form.deliverable"
          v-model:budget="form.budget"
          v-model:deliver-by="form.deliverBy"
          v-model:cooperation-need="form.cooperationNeed"
          v-model:return-offer="form.returnOffer"
          v-model:bottleneck="form.bottleneck"
          v-model:partnership-mode="form.partnershipMode"
        />
      </div>

      <ContactFields
        v-model:name="form.contactName"
        v-model:phone="form.contactPhone"
        v-model:email="form.contactEmail"
        :name-error="errors.contactName"
        :phone-error="errors.contactPhone"
        :email-error="errors.contactEmail"
      />

      <div class="field" data-field="identity">
        <span class="field-label">发布身份<span class="req"> *</span></span>
        <IdentityPicker
          v-if="identityOptions.length"
          :identities="identityOptions"
          :selected="form.asIdentity"
          :selected-enterprise-id="form.asEnterpriseId"
          :user-name="auth.name"
          @select="pickIdentity"
        />
        <!-- v48：无可用身份时给出空态出口，否则字段区空白且提交必然失败。
             出口指向身份管理页：该页同时提供实名登记与企业合作（加入企业）两条路径 -->
        <EmptyBlock
          v-else
          text="暂无可用的发布身份，请先完成身份信息登记或加入企业"
          action-text="去处理身份"
          @action="router.push('/me/identities')"
        />
        <p v-if="identityOptions.length" class="field-help">以企业身份发布的需求将归属该企业主体</p>
      </div>

      <Button
        class="submit-btn mobile-sticky-action"
        theme="primary"
        size="large"
        block
        type="submit"
        :disabled="!form.asIdentity"
        :loading="submitting"
      >
        {{ revising ? '重新提交' : '提交需求' }}
      </Button>
      <p v-if="!form.asIdentity" class="field-help">暂无可用的发布身份，无法提交。请先完成身份信息登记或加入企业</p>
      </form>
    </template>
  </div>
</template>

<style scoped>
.m-demand-form {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
}

.revision-label {
  width: fit-content;
  margin: 0 0 var(--app-space-2);
  padding: var(--app-space-2) var(--app-space-4);
  border-radius: var(--td-radius-round);
  background: var(--td-warning-color-1);
  color: var(--td-warning-color);
  font: var(--app-type-caption);
}

.subtitle {
  margin:0 0 var(--app-space-6);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

/* 必填标识（与 SchemaField 的 .req 同口径） */
.req {
  color: var(--td-error-color);
}

.dict-loading {
  padding: var(--app-space-4) 0;
}

.dict-retry {
  margin-left:var(--app-space-3);
}

/* 审核与推进流程卡 */
.flow {
  margin-bottom:var(--app-space-8);
  padding:var(--app-space-6) var(--app-space-7);
}

.flow-label {
  display: block;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
  margin-bottom:var(--app-space-4);
}

.flow-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap:var(--app-space-2);
}

.flow-arrow {
  color: var(--td-text-color-placeholder);
}

.field {
  margin-bottom:var(--app-space-8);
}

.field label,
.field .field-label {
  display: block;
  font: var(--app-type-body);
  margin-bottom:var(--app-space-4);
  color: var(--td-text-color-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.submit-btn {
  margin-top:var(--app-space-4);
}
</style>
