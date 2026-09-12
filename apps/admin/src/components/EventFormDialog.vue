<script setup lang="ts">
import { defineAsyncComponent, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import { createEvent, updateEvent, type EventPayload } from '@/api/events'
import { fetchPointsRules } from '@/api/mall'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { CommunityEvent } from '@/types'

const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

/* 活动新增/编辑弹窗：基本信息 + 报名截止时间
 * + 可见范围/等级 + 可报名范围/等级（默认与可见一致，可单独调整）+ 报名需审核
 * 新增无定时发布选项：新活动统一进入「待发布」，由列表操作决定立即发布/定时发布 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  event: CommunityEvent | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

/* 活动类型选项来自数据字典，加载失败回退默认词表 */
const typeOptions = ref(dictFallback.event_type.map((t) => ({ label: t, value: t })))

const submitting = ref(false)
const formRef = ref()
const tagsText = ref('')

const form = reactive({
  title: '',
  type: '沙龙',
  startTime: '',
  endTime: '',
  location: '',
  capacity: 30,
  speaker: '',
  host: '',
  description: '',
  enrollmentDeadline: '',
  visibilityIdentities: [] as string[],
  visibilityLevels: [] as string[],
  enrollmentIdentities: [] as string[],
  enrollmentLevels: [] as string[],
  requireReview: true,
  enrollPoints: 5,
  checkinPoints: 10,
})

/* 积分规则默认分值：报名奖励 / 签到奖励 */
const rulePoints = reactive({ enroll: 5, checkin: 10 })

/* 范围开关：可见范围/可报名范围（关=不限，提交空数组） */
const customVisibility = ref(false)
const customEnrollment = ref(false)

onMounted(async () => {
  try {
    const rules = await fetchPointsRules()
    rulePoints.enroll = rules.find((r) => r.code === 'activity_enroll_approved')?.points ?? 5
    rulePoints.checkin = rules.find((r) => r.code === 'activity_checkin')?.points ?? 10
    if (props.visible && props.mode === 'create') {
      form.enrollPoints = rulePoints.enroll
      form.checkinPoints = rulePoints.checkin
    }
  } catch {
    /* 规则加载失败时保留默认值 */
  }
  fetchDictEntries('event_type')
    .then((entries) => {
      const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
      if (labels.length) typeOptions.value = labels
    })
    .catch(() => {
      /* 字典加载失败保留回退词表 */
    })
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    if (props.mode === 'edit' && props.event) {
      form.title = props.event.title
      form.type = props.event.type
      form.startTime = props.event.startTime
      form.endTime = props.event.endTime
      form.location = props.event.location
      form.capacity = props.event.capacity
      form.speaker = props.event.speaker === '—' ? '' : props.event.speaker
      form.host = props.event.host
      form.description = props.event.description
      form.enrollmentDeadline = props.event.enrollmentDeadline ?? ''
      form.visibilityIdentities = [...props.event.visibilityIdentities]
      form.visibilityLevels = [...props.event.visibilityLevels]
      form.enrollmentIdentities = [...props.event.enrollmentIdentities]
      form.enrollmentLevels = [...props.event.enrollmentLevels]
      form.requireReview = props.event.requireReview
      form.enrollPoints = props.event.enrollPoints ?? rulePoints.enroll
      form.checkinPoints = props.event.checkinPoints ?? rulePoints.checkin
      customVisibility.value = props.event.visibilityIdentities.length > 0 || props.event.visibilityLevels.length > 0
      customEnrollment.value = props.event.enrollmentIdentities.length > 0 || props.event.enrollmentLevels.length > 0
      tagsText.value = props.event.tags.join('，')
    } else {
      form.title = ''
      form.type = '沙龙'
      form.startTime = ''
      form.endTime = ''
      form.location = ''
      form.capacity = 30
      form.speaker = ''
      form.host = '聚屿社区'
      form.description = ''
      form.enrollmentDeadline = ''
      form.visibilityIdentities = []
      form.visibilityLevels = []
      form.enrollmentIdentities = []
      form.enrollmentLevels = []
      form.requireReview = true
      form.enrollPoints = rulePoints.enroll
      form.checkinPoints = rulePoints.checkin
      customVisibility.value = false
      customEnrollment.value = false
      tagsText.value = ''
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 一键同步：可报名范围 ← 可见范围 */
function syncEnrollment() {
  form.enrollmentIdentities = [...form.visibilityIdentities]
  form.enrollmentLevels = [...form.visibilityLevels]
}

/* 规则 trigger 一律 submit：值变化(change)/失焦(blur)的自动校验全部跳过——
 * DatePicker 时间面板交互会引发失焦导致提前红框；确认时 formRef.validate()
 * 默认 trigger='all' 会命中全部规则，此时才红框提示 */
const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入活动标题', trigger: 'submit' }],
  type: [{ required: true, message: '请选择活动类型', trigger: 'submit' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'submit' }],
  endTime: [{ required: true, message: '请选择结束时间', trigger: 'submit' }],
  location: [{ required: true, message: '请输入地点', trigger: 'submit' }],
}

function parseTags(): string[] {
  return tagsText.value
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload: EventPayload = {
      title: form.title,
      type: form.type,
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location,
      capacity: form.capacity,
      speaker: form.speaker || '—',
      host: form.host,
      description: form.description,
      tags: parseTags(),
      visibilityIdentities: customVisibility.value ? form.visibilityIdentities : [],
      visibilityLevels: customVisibility.value ? form.visibilityLevels : [],
      enrollmentIdentities: customEnrollment.value ? form.enrollmentIdentities : [],
      enrollmentLevels: customEnrollment.value ? form.enrollmentLevels : [],
      requireReview: form.requireReview,
      enrollmentDeadline: form.enrollmentDeadline || undefined,
      enrollPoints: form.enrollPoints,
      checkinPoints: form.checkinPoints,
    }
    if (props.mode === 'create') {
      const event = await createEvent(payload)
      MessagePlugin.success(`活动已新增，进入待发布状态（${event.id}）`)
    } else if (props.event) {
      await updateEvent(props.event.id, payload)
      MessagePlugin.success('活动修改已保存')
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :close-on-overlay-click="true"
    :visible="visible"
    :header="mode === 'create' ? '新增活动' : '编辑活动'"
    width="880px"
    lazy
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认新增' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="活动标题" name="title">
        <t-input clearable v-model="form.title" placeholder="请输入活动标题…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="活动类型" name="type">
          <t-select clearable v-model="form.type" :options="typeOptions" />
        </t-form-item>
        <t-form-item label="容量" name="capacity">
          <t-input-number v-model="form.capacity" :min="1" theme="column" style="width: 100%" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="开始时间" name="startTime">
          <t-date-picker
            v-model="form.startTime"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            style="width: 100%"
          />
        </t-form-item>
        <t-form-item label="结束时间" name="endTime">
          <t-date-picker
            v-model="form.endTime"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            style="width: 100%"
          />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="报名截止时间" name="enrollmentDeadline">
          <t-date-picker
            v-model="form.enrollmentDeadline"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            placeholder="留空 = 不限，活动开始前均可报名…"
            style="width: 100%"
          />
        </t-form-item>
        <t-form-item name="requireReview">
          <template #label>
            <t-popup content="开启后，用户报名需经管理员审核；关闭后报名自动通过" show-arrow>
              <span class="scope-popup-trigger">报名需审核</span>
            </t-popup>
          </template>
          <t-popup content="开启后，用户报名需经管理员审核；关闭后报名自动通过" show-arrow>
            <span class="scope-switch-trigger"><t-switch v-model="form.requireReview" /></span>
          </t-popup>
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="地点" name="location">
          <t-input clearable v-model="form.location" placeholder="如 聚屿路演厅…" />
        </t-form-item>
        <t-form-item label="主办方" name="host">
          <t-input clearable v-model="form.host" placeholder="如 聚屿社区…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="主讲嘉宾" name="speaker">
          <t-input clearable v-model="form.speaker" placeholder="无则留空…" />
        </t-form-item>
        <t-form-item label="标签" name="tags">
          <t-input clearable v-model="tagsText" placeholder="多个标签用逗号分隔…" />
        </t-form-item>
      </div>

      <div class="form-row">
        <div class="scope-col">
          <div class="scope-head">
            <t-popup content="关闭 = 所有用户可见" show-arrow>
              <span class="scope-title scope-popup-trigger">自定义可见范围</span>
            </t-popup>
            <t-popup content="关闭 = 所有用户可见" show-arrow>
              <span class="scope-switch-trigger"><t-switch v-model="customVisibility" /></span>
            </t-popup>
          </div>
          <t-form-item v-if="customVisibility" label="身份" name="visibilityIdentities">
            <t-select
              v-model="form.visibilityIdentities"
              multiple
              clearable
              :options="visibilityIdentityOptions"
              placeholder="不限…"
            />
          </t-form-item>
          <t-form-item v-if="customVisibility" label="等级" name="visibilityLevels">
            <t-select v-model="form.visibilityLevels" multiple clearable :options="userLevelOptions" placeholder="不限…" />
          </t-form-item>
        </div>
        <div class="scope-col">
          <div class="scope-head">
            <t-popup content="关闭 = 所有用户可报名" show-arrow>
              <span class="scope-title scope-popup-trigger">自定义可报名范围</span>
            </t-popup>
            <div class="scope-right">
              <t-button v-if="customEnrollment && customVisibility" variant="text" size="small" @click="syncEnrollment">同步可见范围</t-button>
              <t-popup content="关闭 = 所有用户可报名" show-arrow>
                <span class="scope-switch-trigger"><t-switch v-model="customEnrollment" /></span>
              </t-popup>
            </div>
          </div>
          <t-form-item v-if="customEnrollment" label="身份" name="enrollmentIdentities">
            <t-select
              v-model="form.enrollmentIdentities"
              multiple
              clearable
              :options="visibilityIdentityOptions"
              placeholder="不限…"
            />
          </t-form-item>
          <t-form-item v-if="customEnrollment" label="等级" name="enrollmentLevels">
            <t-select v-model="form.enrollmentLevels" multiple clearable :options="userLevelOptions" placeholder="不限…" />
          </t-form-item>
        </div>
      </div>

      <div class="form-row">
        <div class="scope-col">
          <t-form-item class="reward-value" name="enrollPoints">
            <template #label>
              <t-popup content="默认使用积分规则值，可直接为本活动调整报名奖励" show-arrow>
                <span class="scope-popup-trigger">报名奖励积分（规则值：{{ rulePoints.enroll }}）</span>
              </t-popup>
            </template>
            <t-popup content="默认使用积分规则值，可直接为本活动调整报名奖励" show-arrow>
              <div class="reward-input-trigger">
                <t-input-number v-model="form.enrollPoints" :min="0" theme="column" style="width: 100%" />
              </div>
            </t-popup>
          </t-form-item>
        </div>
        <div class="scope-col">
          <t-form-item class="reward-value" name="checkinPoints">
            <template #label>
              <t-popup content="默认使用积分规则值，可直接为本活动调整签到奖励" show-arrow>
                <span class="scope-popup-trigger">签到奖励积分（规则值：{{ rulePoints.checkin }}）</span>
              </t-popup>
            </template>
            <t-popup content="默认使用积分规则值，可直接为本活动调整签到奖励" show-arrow>
              <div class="reward-input-trigger">
                <t-input-number v-model="form.checkinPoints" :min="0" theme="column" style="width: 100%" />
              </div>
            </t-popup>
          </t-form-item>
        </div>
      </div>

      <t-form-item label="活动简介" name="description">
        <RichEditor v-model="form.description" placeholder="活动详细说明，支持图文排版…" :min-height="320" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.scope-col {
  min-width: 0;
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.scope-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  margin-bottom: 8px;
}

.reward-value {
  margin-bottom: 0;
}

.reward-input-trigger {
  width: 100%;
}

.scope-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-title {
  font-size: 14px;
  font-weight: 400;
  color: var(--td-text-color-primary);
}

.scope-popup-trigger {
  cursor: help;
}

.scope-switch-trigger {
  display: inline-flex;
}
</style>
