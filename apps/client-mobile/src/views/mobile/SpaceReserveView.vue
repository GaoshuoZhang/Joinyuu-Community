<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Cell, DateTimePicker, Input, Loading, NoticeBar, Popup, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchAvailability, fetchSpaces, createReservation } from '@/api/spaces'
import { ApiError } from '@/api/http'
import type { Space, SpaceSlot } from '@/types'

/* 移动预约：日期 + 时段 chips（占用禁选）+ 主题 + 提交 */
const route = useRoute()
const router = useRouter()
const spaceId = String(route.params.id)

const space = ref<Space | null>(null)
const date = ref(new Date().toISOString().slice(0, 10))
const slots = ref<SpaceSlot[]>([])
const slotsLoading = ref(false)
const form = reactive({ selected: '', topic: '' })
const submitting = ref(false)
const resultStatus = ref<'' | 'pending' | 'approved'>('')
const datePickerVisible = ref(false)

onMounted(async () => {
  const list = await fetchSpaces()
  space.value = list.find((s) => s.id === spaceId) ?? null
  await loadSlots()
})

async function loadSlots() {
  slotsLoading.value = true
  form.selected = ''
  try {
    slots.value = await fetchAvailability(spaceId, date.value)
  } finally {
    slotsLoading.value = false
  }
}

const canSubmit = computed(() => !!form.selected && !submitting.value)

async function onSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const res = await createReservation({ spaceId, date: date.value, start: form.selected, end: nextHour(form.selected), topic: form.topic })
    resultStatus.value = res.status
    Toast(res.status === 'approved' ? '预约成功' : '预约已提交，待审核')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function nextHour(start: string): string {
  const [h, m] = start.split(':').map(Number)
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function goMine() {
  void router.push('/me/reservations')
}
</script>

<template>
  <div class="page-fade-in reserve">
    <div class="m-card head">
      <h1 class="page-title">{{ space?.name ?? '空间预约' }}</h1>
      <p class="page-desc">{{ space?.location }} · {{ space?.needApproval ? '需审批' : '免审批' }} · {{ space?.openTime }}-{{ space?.closeTime }}</p>
    </div>

    <div class="m-card">
      <Cell class="date-cell" title="预约日期" :note="date" arrow :bordered="false" @click="datePickerVisible = true" />
    </div>

    <div class="m-card">
      <label class="field-label">选择时段（1 小时）</label>
      <Loading v-if="slotsLoading" class="slots-loading" text="加载中…" />
      <div v-else class="slots">
        <Tag
          v-for="slot in slots"
          :key="slot.start"
          class="slot"
          size="medium"
          :theme="form.selected === slot.start ? 'primary' : 'default'"
          variant="light"
          :disabled="slot.occupied"
          @click="form.selected = slot.start"
        >
          {{ slot.start }}
        </Tag>
      </div>
      <p class="field-help">灰色为已占用时段</p>
    </div>

    <div class="m-card">
      <label class="field-label">预约主题（选填）</label>
      <Input v-model="form.topic" :maxlength="30" placeholder="如：项目周会…" />
    </div>

    <Button theme="primary" size="large" block :disabled="!canSubmit" :loading="submitting" @click="onSubmit">
      {{ submitting ? '提交中…' : '提交预约' }}
    </Button>
    <Button theme="primary" variant="text" block class="mine-link" @click="goMine">查看我的预约</Button>

    <NoticeBar
      v-if="resultStatus"
      visible
      :theme="resultStatus === 'approved' ? 'success' : 'warning'"
      :content="resultStatus === 'approved' ? '✅ 预约成功！' : '🕐 预约已提交，等待管理员审核。'"
    />

    <Popup v-model:visible="datePickerVisible" placement="bottom">
      <DateTimePicker
        v-model="date"
        mode="date"
        format="YYYY-MM-DD"
        title="选择预约日期"
        @confirm="datePickerVisible = false; loadSlots()"
        @cancel="datePickerVisible = false"
      />
    </Popup>
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

.mine-link {
  margin-top: 2px;
}
</style>
