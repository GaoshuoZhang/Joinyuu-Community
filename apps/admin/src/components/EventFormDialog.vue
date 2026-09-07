<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { createEvent, updateEvent, type EventPayload } from '@/api/events'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { CommunityEvent } from '@/types'

/* 活动创建/编辑弹窗：基本信息 + 报名截止时间
 * + 可见范围/等级 + 可报名范围/等级（默认与可见一致，可单独调整）+ 报名是否需审核
 * 创建无定时发布选项：新活动统一进入「待发布」，由列表操作决定立即发布/定时发布 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  event: CommunityEvent | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const typeOptions = ['沙龙', '培训', '路演', '社交', '赛事'].map((t) => ({ label: t, value: t }))

const reviewOptions = [
  { label: '需审核', value: 1 },
  { label: '无需审核（报名即通过）', value: 0 },
]

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
  requireReview: 1,
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
      form.requireReview = props.event.requireReview ? 1 : 0
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
      form.requireReview = 1
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
  if (valid !== true) return
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
      visibilityIdentities: form.visibilityIdentities,
      visibilityLevels: form.visibilityLevels,
      enrollmentIdentities: form.enrollmentIdentities,
      enrollmentLevels: form.enrollmentLevels,
      requireReview: form.requireReview === 1,
      enrollmentDeadline: form.enrollmentDeadline || undefined,
    }
    if (props.mode === 'create') {
      const event = await createEvent(payload)
      MessagePlugin.success(`活动已创建，进入待发布状态（${event.id}）`)
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
    :visible="visible"
    :header="mode === 'create' ? '创建活动' : '编辑活动'"
    width="680px"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认创建' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="活动标题" name="title">
        <t-input v-model="form.title" placeholder="请输入活动标题" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="活动类型" name="type">
          <t-select v-model="form.type" :options="typeOptions" />
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
      <t-form-item label="报名截止时间" name="enrollmentDeadline">
        <t-date-picker
          v-model="form.enrollmentDeadline"
          valueType="YYYY-MM-DD HH:mm"
          enable-time-picker
          clearable
          placeholder="留空 = 不限，活动开始前均可报名"
          style="width: 100%"
        />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="地点" name="location">
          <t-input v-model="form.location" placeholder="如 聚屿路演厅" />
        </t-form-item>
        <t-form-item label="主办方" name="host">
          <t-input v-model="form.host" placeholder="如 聚屿社区" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="主讲嘉宾" name="speaker">
          <t-input v-model="form.speaker" placeholder="无则留空" />
        </t-form-item>
        <t-form-item label="标签" name="tags">
          <t-input v-model="tagsText" placeholder="多个标签用逗号分隔" />
        </t-form-item>
      </div>

      <div class="scope-head">
        <span class="scope-title">可见范围</span>
        <span class="scope-tip">决定哪些身份、等级的用户能看到该活动</span>
      </div>
      <div class="form-row">
        <t-form-item label="身份" name="visibilityIdentities">
          <t-select
            v-model="form.visibilityIdentities"
            multiple
            clearable
            :options="visibilityIdentityOptions"
            placeholder="不限"
          />
        </t-form-item>
        <t-form-item label="等级" name="visibilityLevels">
          <t-select v-model="form.visibilityLevels" multiple clearable :options="userLevelOptions" placeholder="不限" />
        </t-form-item>
      </div>

      <div class="scope-head">
        <span class="scope-title">可报名范围</span>
        <div class="scope-right">
          <span class="scope-tip">默认与可见范围一致</span>
          <t-button variant="text" size="small" @click="syncEnrollment">同步可见范围</t-button>
        </div>
      </div>
      <div class="form-row">
        <t-form-item label="身份" name="enrollmentIdentities">
          <t-select
            v-model="form.enrollmentIdentities"
            multiple
            clearable
            :options="visibilityIdentityOptions"
            placeholder="不限"
          />
        </t-form-item>
        <t-form-item label="等级" name="enrollmentLevels">
          <t-select v-model="form.enrollmentLevels" multiple clearable :options="userLevelOptions" placeholder="不限" />
        </t-form-item>
      </div>

      <t-form-item label="报名是否需审核" name="requireReview">
        <t-radio-group v-model="form.requireReview" :options="reviewOptions" />
      </t-form-item>

      <t-form-item label="活动简介" name="description">
        <t-textarea v-model="form.description" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="活动详细说明" />
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.scope-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.scope-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.scope-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>