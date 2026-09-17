<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Cell, CheckTag, DateTimePicker, Icon, Input, Popup, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { createDemand, fetchMyDemandPayload, resubmitDemand } from '@/api/demands'
import { fetchMyIdentities } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import { useAuthStore, identityOptionLabel } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useDict } from '@/composables/useDict'
import { useDraft } from '@/composables/useDraft'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { DEMAND_KINDS, DEMAND_KIND_LABELS } from '@/constants/demand'
import type { DemandCreatePayload, DemandKind, IdentityType, UserIdentity } from '@/types'
import { formatMockDate, mockClockVersion } from '@/mock/runtime'

/* 需求发布表单（schema 由 kind 决定：找服务 / 找投资 / 找合作），提交即 pending。
 * 发布身份仅作为归属（发布后列表展示的发布方），在表单内单选；
 * 联系信息供响应方联系，task 另有「预期交付日期」。 */

const props = defineProps<{ kind: DemandKind }>()
const kindMeta = computed(() => DEMAND_KINDS.find((k) => k.kind === props.kind) ?? DEMAND_KINDS[0])
const isTask = computed(() => props.kind === 'task')
const isInvest = computed(() => props.kind === 'investment')
const kindLabel = computed(() => DEMAND_KIND_LABELS[props.kind])

/** 三类需求的字段文案 */
const labels = computed(() =>
  isTask.value
    ? { title: '需求标题', titlePh: '一句话描述你的需求', desc: '需求描述', descPh: '补充背景、期望的交付形式与合作方式…', cat: '需求类别' }
    : isInvest.value
      ? { title: '项目名称', titlePh: '一句话描述你的项目', desc: '项目简介', descPh: '介绍项目背景、当前进展与团队情况…', cat: '所属行业' }
      : { title: '合作需求标题', titlePh: '一句话概括你的合作需求', desc: '业务现状与瓶颈', descPh: '说说当前业务进展、遇到的瓶颈与期望的合作方向…', cat: '合作领域' },
)

const router = useRouter()
const route = useRoute()
/** v34 修改重提：携带 ?revise=<需求 id> 进入本表单 */
const reviseId = String(route.query.revise ?? '')
const revising = computed(() => !!reviseId)
const auth = useAuthStore()
const config = useConfigStore()
const { items: dictItems, error: dictError, reload: reloadDict } = useDict(isInvest.value ? 'industry' : 'demand_category')

/** 发布身份选项：持「社区个体」时不再单列「个人用户」；含成员被授权「发布需求」的企业（代企业发布） */
const delegatedIdentities = ref<UserIdentity[]>([])
const identityOptions = computed(() => {
  const base = auth.identities.filter((i) => !(i.type === 'individual' && auth.hasCommunityIndividual))
  const extra = delegatedIdentities.value.filter(
    (d) => !base.some((b) => b.type === 'community_enterprise' && b.enterpriseId === d.enterpriseId),
  )
  return [...base, ...extra]
})

/** 身份 chips 选中判定（企业需同时匹配企业 id，区分多个企业成员身份） */
function isIdentityPicked(i: UserIdentity): boolean {
  return form.asIdentity === i.type && (i.type !== 'community_enterprise' || form.asEnterpriseId === (i.enterpriseId ?? ''))
}

function pickIdentity(i: UserIdentity) {
  form.asIdentity = i.type
  form.asEnterpriseId = i.type === 'community_enterprise' ? (i.enterpriseId ?? '') : ''
}

const demandOpen = ref(true)
const submitting = ref(false)
const showDeliverBy = ref(false)
/** 预期交付日期下限 = 今天（Picker 无值时回落到 start，默认 start 为 10 年前） */
const todayStr = computed(() => {
  void mockClockVersion.value
  return formatMockDate()
})
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

/* v36 草稿自动保存（按需求类型隔离）；v38 修复放弃回写与空草稿，修改重提不写草稿 */
const {
  hasDraft: draftAvailable,
  savedAt: draftSavedAt,
  detect: detectDraft,
  restore: restoreDraft,
  discard: discardDraft,
  clear: clearDraft,
} = useDraft(
  `demand-${props.kind}`,
  () => ({ ...form }),
  (value) => Object.assign(form, value),
  {
    enabled: () => !revising.value,
    isEmpty: () => !form.title.trim() && !form.description.trim(),
  },
)

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
    } catch (e) {
      Toast(e instanceof ApiError ? e.message : '加载原需求失败')
    }
    return
  }
  /* v36：探测未提交草稿 */
  detectDraft()
})

/* v38：行内校验（长表单 Toast 消失后用户找不到出错字段） */
const errors = reactive({
  title: '', description: '', category: '', deliverable: '', deliverBy: '',
  cooperationNeed: '', bottleneck: '', contactName: '', contactPhone: '', contactEmail: '',
})

async function onSubmit() {
  Object.keys(errors).forEach((key) => { (errors as Record<string, string>)[key] = '' })
  let firstError = ''
  const check = (key: keyof typeof errors, message: string) => {
    if (!firstError) firstError = message
    errors[key] = message
  }
  if (!form.title.trim()) check('title', `请输入${labels.value.title}`)
  if (!form.description.trim()) check('description', `请输入${labels.value.desc}`)
  if (!form.categoryCode) check('category', `请选择${labels.value.cat}`)
  if (isTask.value && !form.deliverable.trim()) check('deliverable', '请输入期望交付')
  if (isTask.value && !form.deliverBy) check('deliverBy', '请选择预期交付日期')
  if (isInvest.value && !form.cooperationNeed.trim()) check('cooperationNeed', '请输入希望获得的投资 / 合作')
  if (!isTask.value && !isInvest.value && !form.bottleneck.trim()) check('bottleneck', '请描述业务瓶颈与合作诉求')
  if (!form.contactName.trim()) check('contactName', '请输入联系人')
  if (!/^1\d{10}$/.test(form.contactPhone.trim())) check('contactPhone', '请输入正确的联系电话')
  if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) check('contactEmail', '请输入正确的联系邮箱')
  if (firstError) {
    Toast(firstError)
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
      Toast('已重新提交审核')
    } else {
      await createDemand(payload)
      Toast('已提交审核')
    }
    clearDraft()
    await router.push('/me/demands')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="m-demand-form page-fade-in">
    <div v-if="!demandOpen">
      <EmptyBlock text="发布功能暂未开放" />
    </div>

    <template v-else>
      <h1 class="title">{{ revising ? `修改重提 · ${kindLabel}` : kindLabel }}</h1>
      <p class="subtitle">{{ revising ? '修改后将重新进入审核队列' : '提交后进入审核，通过后展示在项目列表' }}</p>

      <div v-if="draftAvailable && !revising" class="draft-bar">
        <span>检测到 {{ draftSavedAt }} 的未提交草稿</span>
        <a v-pressable @click="restoreDraft">恢复</a>
        <a v-pressable @click="discardDraft">放弃</a>
      </div>

      <div class="flow m-card">
        <span class="flow-label">发布后推进流程</span>
        <div class="flow-steps">
          <template v-for="(s, i) in kindMeta.process" :key="s">
            <Tag class="flow-step" size="small" variant="light" theme="primary">{{ s }}</Tag>
            <Icon v-if="i < kindMeta.process.length - 1" name="chevron-right" size="12px" class="flow-arrow" />
          </template>
        </div>
      </div>

      <div class="field">
        <label>{{ labels.title }}</label>
        <Input v-model="form.title" :maxlength="50" :placeholder="labels.titlePh" clearable />
        <p v-if="errors.title" class="field-error">{{ errors.title }}</p>
      </div>

      <div class="field">
        <label>{{ labels.desc }}</label>
        <Textarea v-model="form.description" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="1000" :placeholder="labels.descPh" />
        <p v-if="errors.description" class="field-error">{{ errors.description }}</p>
      </div>

      <div class="field">
        <span class="field-label">{{ labels.cat }}</span>
        <div class="chips">
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
          <a class="dict-retry" v-pressable @click="reloadDict">重试</a>
        </p>
        <p v-else-if="errors.category" class="field-error">{{ errors.category }}</p>
      </div>

      <template v-if="isTask">
        <div class="field">
          <label>期望交付</label>
          <Textarea
            v-model="form.deliverable"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="希望对方交付什么（成果物、验收标准、周期…）"
          />
          <p v-if="errors.deliverable" class="field-error">{{ errors.deliverable }}</p>
        </div>
        <div class="field">
          <label>预算范围（选填）</label>
          <Input v-model="form.budget" :maxlength="50" placeholder="如：¥8,000 - 15,000 / 面议" clearable />
        </div>
        <div class="field">
          <span class="field-label">预期交付日期</span>
          <Cell class="date-trigger" :title="form.deliverBy || '请选择预期交付日期'" arrow @click="showDeliverBy = true" />
          <Popup v-model:visible="showDeliverBy" placement="bottom">
            <DateTimePicker
              v-model="form.deliverBy"
              mode="date"
              format="YYYY-MM-DD"
              :start="todayStr"
              title="选择预期交付日期"
              @confirm="showDeliverBy = false"
              @cancel="showDeliverBy = false"
            />
          </Popup>
          <p v-if="errors.deliverBy" class="field-error">{{ errors.deliverBy }}</p>
        </div>
      </template>

      <template v-else-if="isInvest">
        <div class="field">
          <label>希望获得的投资 / 合作</label>
          <Textarea
            v-model="form.cooperationNeed"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="如：天使轮融资 50 万、渠道资源合作、联合研发…"
          />
          <p v-if="errors.cooperationNeed" class="field-error">{{ errors.cooperationNeed }}</p>
        </div>
        <div class="field">
          <label>可提供的回报与资源（选填）</label>
          <Textarea
            v-model="form.returnOffer"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="如：股权、项目分红、技术与团队能力…"
          />
        </div>
      </template>

      <template v-else>
        <div class="field">
          <label>业务瓶颈与合作诉求</label>
          <Textarea
            v-model="form.bottleneck"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="当前卡在哪里、希望对方补足什么能力或资源…"
          />
          <p v-if="errors.bottleneck" class="field-error">{{ errors.bottleneck }}</p>
        </div>
        <div class="field">
          <label>期望的合作方式（选填）</label>
          <Input v-model="form.partnershipMode" :maxlength="80" placeholder="如：项目制合作、联合运营、渠道分成…" clearable />
        </div>
        <div class="field">
          <label>可提供的资源与回报（选填）</label>
          <Textarea
            v-model="form.returnOffer"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="如：客户资源、供应链能力、收益分成…"
          />
        </div>
      </template>

      <div class="field">
        <label>联系人</label>
        <Input v-model="form.contactName" :maxlength="20" placeholder="请输入联系人姓名" clearable />
        <p v-if="errors.contactName" class="field-error">{{ errors.contactName }}</p>
      </div>
      <div class="field">
        <label>联系电话</label>
        <Input v-model="form.contactPhone" type="tel" :maxlength="11" placeholder="请输入 11 位手机号" clearable />
        <p v-if="errors.contactPhone" class="field-error">{{ errors.contactPhone }}</p>
      </div>
      <div class="field">
        <label>联系邮箱（选填）</label>
        <Input v-model="form.contactEmail" type="email" autocomplete="email" :spell-check="false" :maxlength="60" placeholder="便于对方直接邮件联系" clearable />
        <p v-if="errors.contactEmail" class="field-error">{{ errors.contactEmail }}</p>
      </div>

      <div class="field">
        <span class="field-label">发布身份</span>
        <div class="chips">
          <CheckTag
            v-for="i in identityOptions"
            :key="`${i.type}:${i.enterpriseId ?? ''}`"
            variant="light"
            size="medium"
            :checked="isIdentityPicked(i)"
            @change="pickIdentity(i)"
          >
            {{ identityOptionLabel(i, auth.name) }}
          </CheckTag>
        </div>
      </div>

      <Button theme="primary" block class="submit-btn" :loading="submitting" @click="onSubmit">{{ revising ? '重新提交' : '提交需求' }}</Button>
    </template>
  </div>
</template>

<style scoped>
.m-demand-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.title {
  margin: 0 0 4px;
  font-size: 18px;
}

.subtitle {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.draft-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--td-radius-default);
  background: var(--td-warning-color-1, #fff1e9);
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.draft-bar a {
  color: var(--td-brand-color);
  cursor: pointer;
}

.draft-bar a:first-of-type {
  margin-left: auto;
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.dict-retry {
  margin-left: 6px;
  color: var(--td-brand-color);
  cursor: pointer;
}

/* 审核与推进流程卡 */
.flow {
  margin-bottom: 16px;
  padding: 12px 14px;
}

.flow-label {
  display: block;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
}

.flow-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.flow-step {
  padding: 5px 8px;
  line-height: 1;
}

.flow-arrow {
  color: var(--td-text-color-placeholder);
}

.field {
  margin-bottom: 16px;
}

.field label,
.field .field-label {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--td-text-color-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.date-trigger {
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}

.submit-btn {
  margin-top: 8px;
}
</style>
