<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Cell, CheckTag, DateTimePicker, Input, NoticeBar, Popup, Toast } from 'tdesign-mobile-vue'
import { fetchAvailability, fetchSpaceDetail, createReservation } from '@/api/spaces'
import { fetchMyIdentities } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import { useAuthStore, identityOptionLabel } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { IdentityType, Space, SpaceSlot, UserIdentity } from '@/types'
import { formatMockDate, mockClockVersion } from '@/mock/runtime'

/* 移动预约：日期 + 时段 chips（占用禁选）+ 主题 + 身份（个人/企业主体）+ 提交 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const spaceId = String(route.params.id)

const space = ref<Space | null>(null)
const spaceLoading = ref(true)
const spaceError = ref('')
const today = computed(() => {
  void mockClockVersion.value
  return formatMockDate()
})
const date = ref(today.value)
const slots = ref<SpaceSlot[]>([])
const slotsLoading = ref(false)
const slotsError = ref('')
let slotsRequestId = 0
/* 预约身份选项：持社区个体时不再单独展示基础「个人用户」；含成员被授权「空间预约」的企业（代企业预约） */
const delegatedIdentities = ref<UserIdentity[]>([])
const identityOptions = computed(() => {
  const base = auth.identities.filter((i) => !(i.type === 'individual' && auth.hasCommunityIndividual))
  const extra = delegatedIdentities.value.filter(
    (d) => !base.some((b) => b.type === 'community_enterprise' && b.enterpriseId === d.enterpriseId),
  )
  return [...base, ...extra]
})
const form = reactive({
  selected: '',
  topic: '',
  asIdentity: (identityOptions.value[0]?.type ?? '') as IdentityType | '',
  asEnterpriseId: '',
})
const submitting = ref(false)
const resultStatus = ref<'' | 'pending' | 'approved'>('')
const datePickerVisible = ref(false)
/* v38：预约时长（1..maxHours 小时） */
const hours = ref(1)
const identityError = ref('')

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
  form.selected = ''
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

const canSubmit = computed(
  () => !!form.selected && !submitting.value && !resultStatus.value && !slotsLoading.value && space.value?.status !== 'maintenance' && !slotConflict.value,
)

/* v38：多时段预约的占用预检 */
const slotConflict = computed(() => {
  if (!form.selected) return false
  const startMinutes = minutesOf(form.selected)
  const endMinutes = startMinutes + hours.value * 60
  return slots.value.some((slot) => {
    const s = minutesOf(slot.start)
    const e = minutesOf(slot.end)
    return slot.occupied && s < endMinutes && startMinutes < e
  })
})

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/* v41：可选时长受开放时段约束，避免提交后才被服务端拒绝 */
const maxSelectableHours = computed(() => {
  const limit = space.value?.maxHours ?? 4
  if (!form.selected || !space.value) return limit
  const remain = Math.floor((minutesOf(space.value.closeTime) - minutesOf(form.selected)) / 60)
  return Math.max(1, Math.min(limit, remain))
})
watch(maxSelectableHours, (limit) => {
  if (hours.value > limit) hours.value = limit
})

async function onSubmit() {
  if (!canSubmit.value) return
  if (!form.asIdentity) {
    identityError.value = '请选择预约身份'
    Toast(identityError.value)
    return
  }
  identityError.value = ''
  submitting.value = true
  try {
    const res = await createReservation({
      spaceId,
      date: date.value,
      start: form.selected,
      end: endTime(form.selected, hours.value),
      topic: form.topic,
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

function endTime(start: string, duration: number): string {
  const [h, m] = start.split(':').map(Number)
  return `${String(h + duration).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function goMine() {
  void router.push('/me/reservations')
}
</script>

<template>
  <div class="page-fade-in reserve">
    <Loading v-if="spaceLoading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="spaceError" :text="spaceError" action-text="重试" @action="loadSpace" />
    <template v-else>
    <NoticeBar
      v-if="space?.status === 'maintenance'"
      visible
      theme="warning"
      content="该空间维护中，暂不可预约，请留意恢复通知。"
    />
    <div class="m-card head">
      <h1 class="page-title">{{ space?.name ?? '空间预约' }}</h1>
      <p class="page-desc">{{ space?.location }} · {{ space?.needApproval ? '需审核' : '免审核' }} · {{ space?.openTime }}-{{ space?.closeTime }}</p>
      <p class="page-desc">规则：单次最长 {{ space?.maxHours }} 小时 · 最多提前 {{ space?.advanceDays }} 天预约</p>
    </div>

    <div class="m-card">
      <Cell class="date-cell" title="预约日期" :note="date" arrow :bordered="false" @click="datePickerVisible = true" />
    </div>

    <div class="m-card">
      <span class="field-label">选择开始时段</span>
      <Loading v-if="slotsLoading" class="slots-loading" text="加载中…" />
      <template v-else-if="slotsError">
        <p class="slots-error">{{ slotsError }}</p>
        <Button size="small" variant="outline" @click="loadSlots">重新加载时段</Button>
      </template>
      <div v-else class="slots">
        <CheckTag
          v-for="slot in slots"
          :key="slot.start"
          class="slot"
          size="medium"
          variant="light"
          :checked="form.selected === slot.start"
          :disabled="slot.occupied"
          @change="form.selected = slot.start"
        >
          {{ slot.start }}
        </CheckTag>
      </div>
      <p class="field-help">灰色为已占用时段</p>
    </div>

    <div class="m-card">
      <span class="field-label">预约时长</span>
      <div class="chips">
        <CheckTag
          v-for="h in maxSelectableHours"
          :key="h"
          size="medium"
          variant="light"
          :checked="hours === h"
          @change="hours = h"
        >
          {{ h }} 小时
        </CheckTag>
      </div>
      <p v-if="slotConflict" class="slots-error">所选时长与已占用时段冲突，请调整开始时间或时长。</p>
    </div>

    <div class="m-card">
      <label class="field-label">预约主题（选填）</label>
      <Input v-model="form.topic" :maxlength="30" placeholder="如：项目周会…" />
    </div>

    <div class="m-card">
      <span class="field-label">以哪个身份预约</span>
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
      <p v-if="identityError" class="field-error">{{ identityError }}</p>
      <p class="field-help">企业身份预约将计为企业主体的预约记录</p>
    </div>

    <Button theme="primary" size="large" block :disabled="!canSubmit" :loading="submitting" @click="onSubmit">
      {{ submitting ? '提交中…' : '提交预约' }}
    </Button>
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
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head .page-title {
  margin: 0 0 4px;
  font-size: 17px;
}

.head .page-desc {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.date-cell {
  padding: 0;
  background: none;
}

.slots-error {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-error-color);
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.field-label {
  display: block;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
}

.slots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.slot {
  min-width: 72px;
}

.slots-loading {
  padding: 8px 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-help {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.mine-link {
  margin-top: 2px;
}
</style>
