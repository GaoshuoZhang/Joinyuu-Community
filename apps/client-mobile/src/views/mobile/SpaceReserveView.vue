<script setup lang="ts">
import { computed, h, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Cell, CheckTag, DateTimePicker, DialogPlugin, Form, FormItem, Input, NoticeBar, Popup, Stepper, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { fetchAvailability, fetchSpaceDetail, createReservation } from '@/api/spaces'
import { fetchMyIdentities } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import { actionIdentityOptions, useAuthStore, identityOptionLabel } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { IdentityType, Space, SpaceSlot, UserIdentity } from '@/types'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { formatLocalDate } from '@/utils/format'
import { availabilityEndpoints, canStartAt, formatSpaceDuration, validateSpaceRange } from '@/utils/spaceRange'

/* 移动预约：日期 + 时段 chips（占用禁选）+ 主题 + 身份（个人/企业主体）+ 提交 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const spaceId = String(route.params.id)

const space = ref<Space | null>(null)
const spaceLoading = ref(true)
const spaceError = ref('')
const businessNowMs = useBusinessNow()
const today = computed(() => formatLocalDate(businessNowMs.value))
const date = ref(today.value)
/* 可选日期上限：后端按 space.advanceDays 校验最大可提前天数（与页面「最多提前 N 天预约」对应），
 * 日期选择器同步传 :end，超范围日期直接不可选，不必等提交后再报错 */
const maxDate = computed(() => {
  const days = space.value?.advanceDays
  if (!days) return undefined
  const limit = new Date(businessNowMs.value)
  limit.setDate(limit.getDate() + days)
  return formatLocalDate(limit.getTime())
})
const slots = ref<SpaceSlot[]>([])
const slotsLoading = ref(false)
const slotsError = ref('')
let slotsRequestId = 0
/* 预约身份选项：持社区个体时不再单独展示基础「个人用户」；含成员被授权「空间预约」的企业（代企业预约） */
const delegatedIdentities = ref<UserIdentity[]>([])
const identityOptions = computed(() => {
  const base = auth.identities
  const extra = delegatedIdentities.value.filter(
    (d) => !base.some((b) => b.type === 'community_enterprise' && b.enterpriseId === d.enterpriseId),
  )
  return actionIdentityOptions([...base, ...extra])
})
const form = reactive({
  start: '',
  end: '',
  topic: '',
  attendees: 1,
  asIdentity: (identityOptions.value[0]?.type ?? '') as IdentityType | '',
  asEnterpriseId: '',
})
/* 参与人数上限取空间容量（后端 create 亦按 space.capacity 校验）；容量缺失/为 0 时退化为至少 1 人 */
const maxAttendees = computed(() => Math.max(space.value?.capacity ?? 1, 1))
const formRef = ref<FormInstanceFunctions>()
const submitting = ref(false)
const resultStatus = ref<'' | 'pending' | 'approved'>('')
const datePickerVisible = ref(false)
const loaded = ref(false)
const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify({ date: date.value, ...form }))
useUnsavedGuard(() => loaded.value && !resultStatus.value && formSnapshot.value !== baseline.value)

watch(today, (value) => {
  if (date.value < value) {
    date.value = value
    void loadSlots()
  }
})

/** 身份 chips 选中判定（企业需同时匹配企业 id） */
function isIdentityPicked(i: UserIdentity): boolean {
  return form.asIdentity === i.type && (i.type !== 'community_enterprise' || form.asEnterpriseId === (i.enterpriseId ?? ''))
}

function pickIdentity(i: UserIdentity) {
  form.asIdentity = i.type
  form.asEnterpriseId = i.type === 'community_enterprise' ? (i.enterpriseId ?? '') : ''
}

watch(identityOptions, (list) => {
  if (list.some(isIdentityPicked)) return
  const first = list[0]
  if (first) pickIdentity(first)
  else {
    form.asIdentity = ''
    form.asEnterpriseId = ''
  }
}, { deep: true })

onMounted(async () => {
  await loadSpace()
  if (!auth.isLogged) return
  try {
    const identities = await fetchMyIdentities()
    delegatedIdentities.value = identities
      .filter((i) => i.type === 'community_enterprise' && i.enterpriseId && (i.isContact || (i.permissions ?? []).includes('space_reserve')))
      .map((i): UserIdentity => ({ type: 'community_enterprise', enterpriseId: i.enterpriseId, enterpriseName: i.name }))
  } catch {
    /* 未登录或接口异常时仅展示自有身份 */
  }
  baseline.value = formSnapshot.value
  loaded.value = true
})

/* v38：空间加载失败可重试（此前静默失败会显示空白页）；按 id 读取详情，避免整表拉取 */
async function loadSpace() {
  spaceLoading.value = true
  spaceError.value = ''
  try {
    space.value = await fetchSpaceDetail(spaceId)
    await loadSlots()
  } catch (e) {
    spaceError.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
  } finally {
    spaceLoading.value = false
  }
}

async function loadSlots() {
  const id = ++slotsRequestId
  slotsLoading.value = true
  slotsError.value = ''
  clearRange()
  try {
    const list = await fetchAvailability(spaceId, date.value)
    /* v38：快速切换日期时，旧请求不得覆盖新结果 */
    if (id !== slotsRequestId) return
    slots.value = list
  } catch (e) {
    if (id !== slotsRequestId) return
    slotsError.value = e instanceof Error ? e.message : '时段加载失败，请重试'
    slots.value = []
  } finally {
    if (id === slotsRequestId) slotsLoading.value = false
  }
}

/* 仅在后端请求/维护态时禁用；字段校验在提交时给出明确反馈（不禁用按钮） */
const submitBlocked = computed(
  () => submitting.value || !!resultStatus.value || slotsLoading.value || space.value?.status === 'maintenance',
)

const endpoints = computed(() => availabilityEndpoints(slots.value))
const fullyBooked = computed(() => slots.value.length > 0 && slots.value.every((slot) => slot.occupied))
const selectedRange = computed(() => {
  if (!form.start || !form.end) return null
  return validateSpaceRange(slots.value, form.start, form.end, space.value?.maxHours ?? 0)
})
const durationLabel = computed(() => {
  return selectedRange.value?.valid ? formatSpaceDuration(form.start, form.end) : ''
})

/* v46：校验迁移 t-form/rules——时段与身份 chips 的选择逻辑不变，错误内联到对应字段下方 */
const rules = computed<FormRules<typeof form>>(() => ({
  start: [{ required: true, message: '请选择开始时间' }],
  end: [{ validator: (val: string) => !!val && !!selectedRange.value?.valid, message: '请选择有效的结束时间' }],
  asIdentity: [{ required: true, message: '请选择预约身份' }],
  attendees: [{
    validator: (val: number) => {
      const count = Number(val)
      return Number.isInteger(count) && count >= 1 && count <= maxAttendees.value
    },
    message: `参与人数需为 1-${maxAttendees.value} 人`,
  }],
}))

/** t-stepper 的 change 回传 string | number，统一收敛为整数：payload、校验与脏值快照口径一致 */
function onAttendeesChange(value: string | number) {
  form.attendees = Number(value)
}

function endpointDisabled(time: string): boolean {
  if (!form.start || form.end) return !canStartAt(slots.value, time)
  return !validateSpaceRange(slots.value, form.start, time, space.value?.maxHours ?? 0).valid
}

function pickEndpoint(time: string) {
  if (!form.start || form.end) {
    form.start = time
    form.end = ''
    return
  }
  if (validateSpaceRange(slots.value, form.start, time, space.value?.maxHours ?? 0).valid) form.end = time
}

function clearRange() {
  form.start = ''
  form.end = ''
  /* 清空后清掉上一轮校验状态，避免清除选择/切换日期后残留错误提示 */
  void nextTick(() => formRef.value?.clearValidate())
}

async function submitReservation() {
  if (submitting.value || resultStatus.value) return
  if (space.value?.status === 'maintenance') {
    Toast('该空间维护中，暂不可预约')
    return
  }
  if (slotsLoading.value) {
    Toast('时段加载中，请稍候')
    return
  }
  submitting.value = true
  try {
    const res = await createReservation({
      spaceId,
      date: date.value,
      start: form.start,
      end: form.end,
      topic: form.topic,
      attendees: form.attendees,
      asIdentity: form.asIdentity,
      ...(form.asIdentity === 'community_enterprise' && form.asEnterpriseId ? { asEnterpriseId: form.asEnterpriseId } : {}),
    })
    resultStatus.value = res.status
    Toast(res.status === 'approved' ? '预约成功' : '预约已提交，待审核')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* 提交前二次确认（与兑换/取消等写操作口径一致）：摘要时间、时长与身份，并说明审核后果 */
function confirmSubmit() {
  if (submitting.value || resultStatus.value) return
  const item = space.value
  if (!item) return
  const identity = identityOptions.value.find(isIdentityPicked)
  DialogPlugin.confirm({
    title: '提交预约',
    content: () =>
      h('div', { style: 'text-align: left' }, [
        h('p', { style: 'margin: 0 0 var(--app-space-3)' }, `空间：${item.name}`),
        h('p', { style: 'margin: 0 0 var(--app-space-3)' }, `时间：${date.value} ${form.start}-${form.end} · ${durationLabel.value}`),
        h('p', { style: 'margin: 0 0 var(--app-space-3)' }, `预约身份：${identity ? identityOptionLabel(identity, auth.name) : '—'}`),
        h(
          'p',
          { style: 'margin: 0' },
          item.needApproval ? '提交后需等待社区运营审核，可在「我的预约」查看结果。' : '该空间免审核，提交后预约立即生效。',
        ),
      ]),
    cancelBtn: '再检查一下',
    confirmBtn: '确认提交',
    onConfirm: () => {
      void submitReservation()
    },
  })
}

function onSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) confirmSubmit()
}

function goMine() {
  void router.push('/me/reservations')
}
</script>

<template>
  <div class="page-fade-in reserve">
    <ListSkeleton v-if="spaceLoading" />
    <EmptyBlock v-else-if="spaceError" :text="spaceError" action-text="重试" @action="loadSpace" />
    <template v-else>
    <NoticeBar
      v-if="space?.status === 'maintenance'"
      visible
      theme="warning"
      content="该空间维护中，暂不可预约，请留意恢复通知。"
    />
    <div class="m-card head">
      <h2 class="page-title">{{ space?.name ?? '空间预约' }}</h2>
      <p class="page-desc">{{ space?.location }} · {{ space?.needApproval ? '需审核' : '免审核' }} · {{ space?.openTime }}-{{ space?.closeTime }}</p>
      <p class="page-desc">规则：单次最长 {{ space?.maxHours }} 小时 · 最多提前 {{ space?.advanceDays }} 天预约</p>
    </div>

    <div class="m-card">
      <Cell class="date-cell" title="预约日期" :note="date" arrow :bordered="false" @click="datePickerVisible = true" />
    </div>

    <Form
      ref="formRef"
      class="reserve-form"
      :data="form"
      :rules="rules"
      label-align="top"
      scroll-to-first-error="smooth"
      @submit="onSubmit"
    >
      <div class="m-card form-card">
        <FormItem class="slot-item" label="选择预约时段" name="start">
          <div v-if="form.start" class="range-heading">
            <Button size="small" variant="text" @click="clearRange">清除选择</Button>
          </div>
          <Loading v-if="slotsLoading" class="slots-loading" text="加载中…" />
          <template v-else-if="slotsError">
            <p class="slots-error">{{ slotsError }}</p>
            <Button size="small" variant="outline" @click="loadSlots">重新加载时段</Button>
          </template>
          <EmptyBlock v-else-if="slots.length === 0" text="当天未设置开放时段" />
          <EmptyBlock v-else-if="fullyBooked" text="当天时段已约满" />
          <template v-else>
          <div class="range-summary">
            <span :class="{ active: form.start }">开始 {{ form.start || '待选择' }}</span>
            <span class="range-arrow">→</span>
            <span :class="{ active: form.end }">结束 {{ form.end || '待选择' }}</span>
            <strong v-if="durationLabel">{{ durationLabel }}</strong>
          </div>
          <div class="slots">
            <CheckTag
              v-for="point in endpoints"
              :key="point"
              class="slot"
              size="medium"
              variant="light"
              :checked="form.start === point || form.end === point"
              :disabled="endpointDisabled(point)"
              @change="pickEndpoint(point)"
            >
              {{ point }}
            </CheckTag>
          </div>
          </template>
        </FormItem>
        <!-- 结束时间与开始时间共用同一组时段 chips，此处只承载 end 字段的校验提示 -->
        <FormItem class="slot-item" name="end">
          <p class="field-help">先点开始时间，再点结束时间；灰色时间不可选，不可跨越占用或非开放时段。</p>
        </FormItem>
      </div>

      <div class="m-card form-card">
        <FormItem label="预约主题（选填）" name="topic">
          <Input v-model="form.topic" :maxlength="30" placeholder="如：项目周会…" />
        </FormItem>
      </div>

      <div class="m-card form-card">
        <FormItem label="参与人数" name="attendees">
          <Stepper :value="form.attendees" :min="1" :max="maxAttendees" theme="filled" @change="onAttendeesChange" />
          <p class="field-help">至少 1 人，不超过该空间容量 {{ maxAttendees }} 人</p>
        </FormItem>
      </div>

      <div class="m-card form-card">
        <FormItem label="以哪个身份预约" name="asIdentity">
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
          <p class="field-help">企业身份预约将计为企业主体的预约记录</p>
        </FormItem>
      </div>

      <Button class="mobile-sticky-action" theme="primary" size="large" block type="submit" :disabled="submitBlocked" :loading="submitting">
        {{ submitting ? '提交中…' : '提交预约' }}
      </Button>
    </Form>
    <Button theme="primary" variant="text" block class="mine-link" @click="goMine">查看我的预约</Button>

    <NoticeBar
      v-if="resultStatus"
      visible
      :theme="resultStatus === 'approved' ? 'success' : 'warning'"
      :content="resultStatus === 'approved' ? '预约成功！' : '预约已提交，等待社区运营审核。'"
    />

    <Popup v-model:visible="datePickerVisible" placement="bottom">
      <DateTimePicker
        v-model="date"
        mode="date"
        format="YYYY-MM-DD"
        :start="today"
        :end="maxDate"
        title="选择预约日期"
        @confirm="datePickerVisible = false; loadSlots()"
        @cancel="datePickerVisible = false"
      />
    </Popup>
    </template>
  </div>
</template>

<style scoped>
.reserve {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.head .page-title {
  margin:0 0 var(--app-space-2);
  font-size: var(--app-font-title);
}

.head .page-desc {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.date-cell {
  padding:0;
  background: none;
}

.slots-error {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

/* 表单版式用官方能力：label-align="top"（标签在上）+ 官方标签字号变量；
 * 不再用 :deep() 改写 t-form 内部类，标签保持可见。 */
.reserve-form {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  --td-form-label-font-size: var(--app-font-body);
}

/* 表单卡片：内距交给 t-form-item 自带的内距，避免与本类叠加造成双重留白 */
.form-card {
  padding: 0;
}

.range-heading {
  display: flex;
  justify-content: flex-end;
  margin-bottom:var(--app-space-4);
}

.range-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap:var(--app-space-3);
  margin-bottom:var(--app-space-4);
  font-size:var(--app-font-body);
  color:var(--td-text-color-placeholder);
}

.range-summary .active,
.range-summary strong {
  color:var(--td-brand-color);
}

.range-summary strong {
  margin-left:auto;
  font-weight:600;
}

.range-arrow {
  color:var(--td-text-color-secondary);
}

.slots {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.slots-loading {
  padding:var(--app-space-4) 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.field-help {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.mine-link {
  margin-top:var(--app-space-1);
}
</style>
