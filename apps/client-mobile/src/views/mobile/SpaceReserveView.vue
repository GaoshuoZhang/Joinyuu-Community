<script setup lang="ts">
import { computed, h, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Cell, CheckTag, DateTimePicker, Form, FormItem, Input, NoticeBar, Popup, Stepper, Tag, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { fetchAvailability, fetchSpaceDetail, createReservation } from '@/api/spaces'
import IdentityPicker from '@/components/forms/IdentityPicker.vue'
import { fetchMyIdentities } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import FlowResult from '@/components/FlowResult.vue'
import { authorizedActionIdentities, useAuthStore, identityOptionLabel } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { IdentityType, Space, SpaceSlot, UserIdentity } from '@/types'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { formatLocalDate } from '@/utils/format'
import { discountLabel, discountedPoints } from '@/utils/points'
import { availabilityEndpoints, billableHours, canStartAt, formatSpaceDuration, spaceFeePoints, timeToMinutes, validateSpaceRange } from '@/utils/spaceRange'

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
/* 可选时段与日期范围只由后台设置决定：时段按空间「开放时间-关闭时间」下发，
 * 日期上限不设限（后台没有「最多提前 N 天」配置入口），仅不能早于今天。 */
const slots = ref<SpaceSlot[]>([])
const slotsLoading = ref(false)
const slotsError = ref('')
let slotsRequestId = 0
/* 预约身份选项：持社区个体时不再单独展示基础「个人用户」；含成员被授权「空间预约」的企业（代企业预约） */
const delegatedIdentities = ref<UserIdentity[]>([])
/* 各社区企业的积分消费折扣（企业 id → 折扣；代企业预约时按企业等级折算费用） */
const enterpriseDiscounts = ref<Record<string, number>>({})
const identityOptions = computed(() => authorizedActionIdentities(auth.identities, delegatedIdentities.value))
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
/* 后端实际扣除的积分（用于结果提示；免费空间为 0） */
const resultPoints = ref(0)
const datePickerVisible = ref(false)
const draftDate = ref(date.value)
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
    enterpriseDiscounts.value = Object.fromEntries(
      identities
        .filter((i) => i.type === 'community_enterprise' && i.enterpriseId)
        .map((i) => [i.enterpriseId as string, i.pointsDiscount]),
    )
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
const cashFee = computed(() => (space.value?.chargeAmountFen ?? 0) > 0)
const submitBlocked = computed(
  () => submitting.value || !!resultStatus.value || slotsLoading.value || space.value?.status === 'maintenance',
)

const endpoints = computed(() => availabilityEndpoints(slots.value))
const fullyBooked = computed(() => slots.value.length > 0 && slots.value.every((slot) => slot.occupied))
const selectedRange = computed(() => {
  if (!form.start || !form.end) return null
  return validateSpaceRange(slots.value, form.start, form.end)
})
const durationLabel = computed(() => {
  return selectedRange.value?.valid ? formatSpaceDuration(form.start, form.end) : ''
})

/* 费用：原价 = 每小时积分 × 计费小时（不足 1 小时按 1 小时计）；再按等级折扣折算（1 = 1 折 … 10 = 原价） */
const baseFeePoints = computed(() => spaceFeePoints(space.value?.feePerHour ?? 0, form.start, form.end))
/* 折扣取值：代企业预约用企业等级折扣，其余用本人社区个体等级折扣（服务端同口径） */
const feeDiscount = computed(() => {
  if (form.asIdentity === 'community_enterprise' && form.asEnterpriseId) {
    return enterpriseDiscounts.value[form.asEnterpriseId] ?? auth.pointsDiscount
  }
  return auth.pointsDiscount
})
const feePoints = computed(() => discountedPoints(baseFeePoints.value, feeDiscount.value))
/* 余额不足：提交按钮不可用（后端扣费同样兜底；未登录时不按余额拦截，交由接口鉴权提示） */
const feeInsufficient = computed(() => feePoints.value > 0 && auth.isLogged && auth.points < feePoints.value)
/* 时长含不足 1 小时的部分时标注计费小时；有折扣时补折扣标注（如全天开放 23:59 结束 = N 小时 59 分） */
const feeHint = computed(() => {
  if (feePoints.value <= 0 || !form.start || !form.end) return ''
  const hours = (timeToMinutes(form.end) - timeToMinutes(form.start)) % 60 === 0 ? '' : ` · 按 ${billableHours(form.start, form.end)} 小时计费`
  const discount = feePoints.value < baseFeePoints.value ? ` · ${discountLabel(feeDiscount.value)}` : ''
  return `${hours}${discount}`
})
const submitLabel = computed(() => {
  if (cashFee.value) return '现金预约请联系运营'
  if (submitting.value) return '提交中…'
  if (feeInsufficient.value) return `积分不足（需 ${feePoints.value} 积分）`
  return feePoints.value > 0 ? `提交预约（消耗 ${feePoints.value} 积分）` : '提交预约'
})
const resultNotice = computed(() => {
  if (!resultStatus.value) return ''
  const head = resultStatus.value === 'approved' ? '预约成功！' : '预约已提交，等待社区运营审核。'
  if (resultPoints.value <= 0) return head
  return resultStatus.value === 'approved'
    ? `${head}已消耗 ${resultPoints.value} 积分。`
    : `${head}已消耗 ${resultPoints.value} 积分，驳回将全额退回。`
})

/* 选中区间的整点都进入选中态：起止端点 + 区间内整点 */
function isPointChecked(point: string): boolean {
  if (!form.start) return false
  if (!form.end) return form.start === point
  return form.start <= point && point <= form.end
}

/* v46：校验迁移 t-form/rules——时段与身份 chips 的选择逻辑不变，错误内联到对应字段下方 */
const rules = computed<FormRules<typeof form>>(() => ({
  /* 起止时间同属一处 chips，合并为一条规则（原先挂在 end 字段的规则随该 FormItem 一并移除） */
  start: [{
    validator: () => !!form.start && !!form.end && !!selectedRange.value?.valid,
    message: '请选择完整的预约时段',
  }],
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
  if (!form.start || form.end) return isPastStart(time) || !canStartAt(slots.value, time)
  return !validateSpaceRange(slots.value, form.start, time).valid
}

function isPastStart(time: string): boolean {
  if (date.value !== today.value) return false
  const now = new Date(businessNowMs.value)
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return time <= currentTime
}

function pickEndpoint(time: string) {
  if (endpointDisabled(time)) return
  if (!form.start || form.end) {
    form.start = time
    form.end = ''
    return
  }
  if (validateSpaceRange(slots.value, form.start, time).valid) form.end = time
}

function openDatePicker() {
  draftDate.value = date.value
  datePickerVisible.value = true
}

function confirmDate(value: string | number | Date) {
  datePickerVisible.value = false
  const nextDate = typeof value === 'string' ? value : formatLocalDate(value)
  if (nextDate === date.value) return
  date.value = nextDate
  void loadSlots()
}

function clearRange() {
  form.start = ''
  form.end = ''
  /* 清空后清掉上一轮校验状态，避免清除选择/切换日期后残留错误提示 */
  void nextTick(() => formRef.value?.clearValidate())
}

async function submitReservation() {
  if (submitting.value || resultStatus.value) return
  if (form.start && isPastStart(form.start)) {
    Toast('开始时间已过，请选择之后的时段或其他日期')
    clearRange()
    return
  }
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
      asIdentity: form.asIdentity || undefined,
      ...(form.asIdentity === 'community_enterprise' && form.asEnterpriseId ? { asEnterpriseId: form.asEnterpriseId } : {}),
    })
    resultStatus.value = res.status
    resultPoints.value = res.pointsSpent
    Toast(res.status === 'approved' ? '预约成功' : '预约已提交，待审核')
    /* 扣分后同步余额：返回列表页/再次预约时按钮的可用性按最新积分判断 */
    void auth.refreshProfile()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

/* 提交前二次确认（与兑换/取消等写操作口径一致）：摘要时间、时长、费用与身份，并说明审核后果 */
function confirmSubmit() {
  if (submitting.value || resultStatus.value) return
  if (form.start && isPastStart(form.start)) {
    Toast('开始时间已过，请重新选择时段')
    clearRange()
    return
  }
  const item = space.value
  if (!item) return
  const identity = identityOptions.value.find(isIdentityPicked)
  confirmDialog({
    title: '提交预约',
    content: () =>
      h('div', { style: 'text-align: left' }, [
        h('p', { style: 'margin: 0 0 var(--app-space-3)' }, `空间：${item.name}`),
        h('p', { style: 'margin: 0 0 var(--app-space-3)' }, `时间：${date.value} ${form.start}-${form.end} · ${durationLabel.value}`),
        ...(feePoints.value > 0
          ? [h('p', { style: 'margin: 0 0 var(--app-space-3)' }, `费用：消耗 ${feePoints.value} 积分（按 ${billableHours(form.start, form.end)} 小时${
            feePoints.value < baseFeePoints.value ? `，${discountLabel(feeDiscount.value)}后` : ''
          }）`)]
          : []),
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
  if (cashFee.value) { Toast('该空间按现金费用预约，请联系运营人员'); return }
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
    <FlowResult
      v-if="resultStatus"
      :title="resultStatus === 'approved' ? '预约成功' : '预约已提交'"
      :theme="resultStatus === 'approved' ? 'success' : 'warning'"
      :description="resultNotice"
      primary-text="查看我的预约"
      secondary-text="返回社区"
      @primary="goMine"
      @secondary="router.replace('/community')"
    />
    <template v-else>
    <NoticeBar
      v-if="space?.status === 'maintenance'"
      visible
      theme="warning"
      content="该空间维护中，暂不可预约，请留意恢复通知。"
    />
    <div class="m-card head">
      <div class="head-top">
        <h2 class="page-title">{{ space?.name ?? '空间预约' }}</h2>
        <!-- 费用：0 表示免费（后台「费用」栏维护） -->
        <!-- v51：收费是中性信息（此前用 warning 语义色，暗示异常）；改为中性品牌色，「免费」保留正向语义 -->
        <!-- v52：flex:none 防止被长标题一并压缩（界面审查 LOW） -->
        <Tag class="head-fee" size="small" variant="light" :theme="cashFee || (space?.feePerHour ?? 0) > 0 ? 'primary' : 'success'">
          {{ cashFee ? '¥' + ((space?.chargeAmountFen ?? 0) / 100).toFixed(2) + '/小时' : (space?.feePerHour ?? 0) > 0 ? `${space?.feePerHour} 积分/小时` : '免费' }}
        </Tag>
      </div>
      <p class="page-desc">{{ space?.location }} · {{ space?.needApproval ? '需审核' : '免审核' }} · {{ space?.openTime }}-{{ space?.closeTime }}</p>
      <!-- 可用设备（后台「配备设备」维护）：后台没有预约规则配置，此处展示空间实际配备 -->
      <div v-if="space?.equipment?.length" class="head-equip">
        <span class="equip-label">可用设备</span>
        <Tag v-for="item in space?.equipment ?? []" :key="item" size="small" variant="light" theme="default">{{ item }}</Tag>
      </div>
    </div>

    <Button theme="primary" variant="text" block class="mine-link" @click="goMine">查看我的预约</Button>

    <div class="m-card">
      <Cell v-pressable class="date-cell" title="预约日期" :note="date" arrow :bordered="false" @click="openDatePicker" />
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
        <!-- 标签行放「清除选择」：label 元素会隐式关联第一个可关联后代（此处即按钮），
             把标签文案的点击转发成按钮点击，故显式给 for 传空串切断隐式关联（时段 chips 非可关联元素，无副作用）；
             必填星号是 label::before 生成的 inline 内容，与行内 flex 容器不同行会单独成行，故本项不显示星号。 -->
        <FormItem class="slot-item" name="start" :required-mark="false" for="">
          <template #label>
            <div class="slot-head">
              <span>选择预约时段</span>
              <Button size="small" variant="text" :disabled="!form.start" @click="clearRange">清除选择</Button>
            </div>
          </template>
          <div class="slot-picker">
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
                <strong v-if="durationLabel">{{ durationLabel }}{{ feeHint }}</strong>
              </div>
              <div class="slots">
                <CheckTag
                  v-for="point in endpoints"
                  :key="point"
                  class="slot"
                  size="medium"
                  variant="light"
                  :checked="isPointChecked(point)"
                  :disabled="endpointDisabled(point)"
                  @change="pickEndpoint(point)"
                >
                  {{ point }}
                </CheckTag>
              </div>
            </template>
          </div>
        </FormItem>
      </div>

      <div class="m-card form-card">
        <FormItem label="预约主题（选填）" name="topic">
          <Input v-model="form.topic" :maxlength="30" placeholder="如：项目周会…" />
        </FormItem>
      </div>

      <div class="m-card form-card">
        <FormItem label="参与人数" name="attendees" :help="`至少 1 人，不超过该空间容量 ${maxAttendees} 人`">
          <Stepper :value="form.attendees" :min="1" :max="maxAttendees" theme="filled" @change="onAttendeesChange" />
        </FormItem>
      </div>

      <div class="m-card form-card">
        <FormItem label="预约身份" name="asIdentity">
          <IdentityPicker :identities="identityOptions" :selected="form.asIdentity" :selected-enterprise-id="form.asEnterpriseId" :user-name="auth.name" @select="pickIdentity" />
        </FormItem>
      </div>

      <Button
        class="mobile-sticky-action"
        theme="primary"
        size="large"
        block
        type="submit"
        :disabled="submitBlocked || feeInsufficient"
        :loading="submitting"
      >
        {{ submitLabel }}
      </Button>
    </Form>

    <Popup v-model:visible="datePickerVisible" placement="bottom">
      <DateTimePicker
        v-model:value="draftDate"
        mode="date"
        format="YYYY-MM-DD"
        :start="today"
        title="选择预约日期"
        @confirm="confirmDate"
        @cancel="datePickerVisible = false"
      />
    </Popup>
    </template>
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

/* v52：长不可断空间名（英文/数字串）不得把费用 Tag 挤出卡片——标题可收缩、可断词
 * （同 MyOrderDetailView 商品名口径，界面审查 LOW：320px/200% 裁切） */
.head .page-title {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font: var(--app-type-page-title);
}

/* 标题 + 费用标签同行（左标题、右费用） */
.head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-3);
  margin:0 0 var(--app-space-2);
}

/* v52：费用标签不参与压缩，长标题收缩断词（见 .head .page-title） */
.head-fee {
  flex: none;
}

.head .page-desc {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

/* 可用设备：沿用空间列表（SpacesView）的设备标签形态 */
.head-equip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap:var(--app-space-3);
  margin-top:var(--app-space-5);
}

.head .equip-label {
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.date-cell {
  padding:0;
  background: none;
}

.slots-error {
  margin:0 0 var(--app-space-4);
  font: var(--app-type-body-sm);
  color: var(--td-error-color);
}

/* 表单版式用官方能力：label-align="top"（标签在上）+ 官方标签字号变量；
 * 不再用 :deep() 改写 t-form 内部类，标签保持可见。
 * 库内 .t-form 根元素自带容器白底（--td-bg-color-container），会把表单卡片之间的
 * 页面灰底缝隙填成白色；此处让它透明，缝隙回到页面底色。
 * 双类名提高特异性：库样式懒加载后写入，单类名会按加载顺序被覆盖。 */
.reserve-form.reserve-form {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  background: transparent;
}

/* 表单卡片：内距交给 t-form-item 自带的内距，避免与本类叠加造成双重留白 */
.form-card {
  padding: 0;
}

/* 标签行：左「选择预约时段」+ 右「清除选择」同行。
 * 负 margin 抵消库内 .t-form__label 的 padding-right: 16px（无对应 API），使按钮右缘与下方 chips 对齐；
 * 升级 TDesign 时需复核该内距。 */
.slot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-3);
  margin-right: -16px;
}

.slot-picker { width: 100%; min-width: 0; }

.range-summary {
  display: flex;
  /* 允许换行：320px 下「开始 → 结束 ｜ 时长·计费」单行最小宽约 400px，
   * nowrap 会把整页撑出横向滚动并裁掉右侧计费文案（WCAG 1.4.10 重排）。 */
  flex-wrap: wrap;
  align-items: center;
  gap:var(--app-space-3);
  margin-bottom:var(--app-space-4);
  min-height: 44px;
  font: var(--app-type-body);
  color:var(--td-text-color-placeholder);
}
.range-summary span { white-space: nowrap; }

.range-summary .active,
.range-summary strong {
  color:var(--td-brand-color);
}

.range-summary strong {
  margin-left:auto;
  font: var(--app-type-emphasis);
}

.range-arrow {
  color:var(--td-text-color-secondary);
}

.slots {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap:var(--app-space-4);
}
.slot { display: flex; min-width: 0; min-height: 44px; align-items: center; justify-content: center; }

.slots-loading {
  padding:var(--app-space-4) 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.mine-link {
  margin-top:var(--app-space-1);
}
</style>
