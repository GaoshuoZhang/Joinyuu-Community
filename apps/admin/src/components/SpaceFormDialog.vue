<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import { createSpace, updateSpace } from '@/api/spaces'
import { spaceTypeMap } from '@/constants/status'
import type { Space, SpaceType } from '@/types'

/* 空间新增/编辑弹窗：基础信息编辑（状态走列表上的独立操作）；
 * 命名提示：空间名会被社区活动 location 引用，重命名需同步活动数据 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  space: Space | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const typeOptions = Object.entries(spaceTypeMap).map(([value, label]) => ({ label, value }))

const submitting = ref(false)
const formRef = ref()
/* 配备设备：t-tag-input 标签数组（回车新增，可整体清空） */
const equipmentTags = ref<string[]>([])

const form = reactive({
  name: '',
  type: 'meeting' as SpaceType,
  capacity: 8,
  location: '',
  allDay: false,
  openTime: '09:00',
  closeTime: '18:00',
  needReservation: false,
  needApproval: false,
  /** 预约费用（积分/小时）；0 = 免费 */
  feePerHour: 0,
  description: '',
})

/* 关闭"需预约"时联动关闭"需审核" */
watch(
  () => form.needReservation,
  (v) => {
    if (!v) form.needApproval = false
  },
)

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    if (props.mode === 'edit' && props.space) {
      form.name = props.space.name
      form.type = props.space.type
      form.capacity = props.space.capacity
      form.location = props.space.location
      form.allDay = props.space.allDay ?? false
      form.openTime = props.space.openTime
      form.closeTime = props.space.closeTime
      form.needReservation = props.space.needReservation ?? false
      form.needApproval = props.space.needApproval ?? false
      form.feePerHour = props.space.feePerHour ?? 0
      form.description = props.space.description
      equipmentTags.value = [...props.space.equipment]
    } else {
      form.name = ''
      form.type = 'meeting'
      form.capacity = 8
      form.location = ''
      form.allDay = false
      form.openTime = '09:00'
      form.closeTime = '18:00'
      form.needReservation = false
      form.needApproval = false
      form.feePerHour = 0
      form.description = ''
      equipmentTags.value = []
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入空间名称', trigger: 'submit' }],
  type: [{ required: true, message: '请选择空间类型', trigger: 'submit' }],
  location: [{ required: true, message: '请输入位置', trigger: 'submit' }],
  openTime: [{ required: true, message: '请选择开放时间', trigger: 'submit' }],
  closeTime: [{ required: true, message: '请选择关闭时间', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  if (!form.allDay && form.closeTime <= form.openTime) {
    MessagePlugin.error('关闭时间需晚于开放时间')
    return
  }
  submitting.value = true
  try {
    const payload = {
      name: form.name,
      type: form.type,
      capacity: form.capacity,
      location: form.location,
      allDay: form.allDay,
      openTime: form.allDay ? '00:00' : form.openTime,
      closeTime: form.allDay ? '23:59' : form.closeTime,
      needReservation: form.needReservation,
      needApproval: form.needReservation ? form.needApproval : false,
      feePerHour: form.feePerHour,
      equipment: [...equipmentTags.value],
      description: form.description,
    }
    if (props.mode === 'create') {
      const space = await createSpace(payload)
      MessagePlugin.success(`空间已新增（${space.id}）`)
    } else if (props.space) {
      await updateSpace(props.space.id, payload)
      MessagePlugin.success('空间修改已保存')
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
    :header="mode === 'create' ? '新增公共空间' : '编辑公共空间'"
    width="880px"
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
      <div class="form-row">
        <t-form-item label="空间名称" name="name">
          <t-input clearable v-model="form.name" placeholder="如 共享会议室 C…" />
        </t-form-item>
        <t-form-item label="空间类型" name="type">
          <t-select clearable v-model="form.type" :options="typeOptions" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="容纳人数" name="capacity">
          <t-input-number v-model="form.capacity" :min="1" theme="column" class="ctl-w-full" />
        </t-form-item>
        <t-form-item label="位置" name="location">
          <t-input clearable v-model="form.location" placeholder="如 岛屿中心 2F…" />
        </t-form-item>
      </div>
      <div class="form-row form-row-single">
        <t-form-item label="全天开放" name="allDay">
          <div class="all-day-row">
            <t-switch v-model="form.allDay" />
            <span class="all-day-tip">开启后不设时段限制，空间展示为"全天开放"</span>
          </div>
        </t-form-item>
      </div>
      <div v-if="!form.allDay" class="form-row">
        <t-form-item label="开放时间" name="openTime">
          <t-time-picker v-model="form.openTime" format="HH:mm" clearable class="ctl-w-full" />
        </t-form-item>
        <t-form-item label="关闭时间" name="closeTime">
          <t-time-picker v-model="form.closeTime" format="HH:mm" clearable class="ctl-w-full" />
        </t-form-item>
      </div>
      <!-- 需预约 / 需审核各自独占整行：开关互斥隐藏时栅格不塌陷，避免右半列空白与字段跳动 -->
      <div class="form-row form-row-single">
        <t-form-item label="需预约" name="needReservation">
          <div class="all-day-row">
            <t-switch v-model="form.needReservation" />
            <span class="all-day-tip">开启后成员需先预约方可使用该空间</span>
          </div>
        </t-form-item>
      </div>
      <div v-if="form.needReservation" class="form-row form-row-single">
        <t-form-item label="需审核" name="needApproval">
          <div class="all-day-row">
            <t-switch v-model="form.needApproval" />
            <span class="all-day-tip">开启后预约需管理员审核通过方可使用</span>
          </div>
        </t-form-item>
      </div>
      <div class="form-row form-row-single">
        <t-form-item label="费用" name="feePerHour" help="0 表示免费使用；按「积分/小时」计费，不足 1 小时按 1 小时计">
          <t-input-number v-model="form.feePerHour" :min="0" theme="normal" suffix="积分/小时" class="ctl-w-full" />
        </t-form-item>
      </div>
      <t-form-item label="配备设备" name="equipment">
        <t-tag-input
          v-model="equipmentTags"
          clearable
          placeholder="输入设备名后回车新增，如 投影仪、白板…"
        />
      </t-form-item>
      <t-form-item label="空间说明" name="description">
        <t-textarea
          v-model="form.description"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="适用场景与使用说明…"
        />
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

/* 单字段整行：不与相邻字段共用两列栅格（开关/开关组互斥隐藏时不留空半列） */
.form-row-single {
  grid-template-columns: 1fr;
}

.all-day-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.all-day-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
