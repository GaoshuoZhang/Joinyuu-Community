<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard } from '@/utils/form'
import {
  createWorkstation,
  deleteWorkstation,
  fetchWorkstationAreas,
  setWorkstationStatus,
  updateWorkstation,
} from '@/api/workstations'
import { workstationTypeMap } from '@/constants/status'
import type { Workstation, WorkstationType } from '@/types'

/* 办公位新增/编辑弹窗（办公位管理/办公室管理两页共用）：
 * 新增 = 选区域 + 编号 + 类型 + 容纳人数 + 备注（新增即空闲，分配走「租赁管理」）；
 * 编辑 = 区域/编号/类型/容纳人数/备注 + 维护中开关（替代原卡片上的维修登记/恢复按钮；
 *        已分配办公位不可维护，需先在「租赁管理」终止租约）+ 删除办公位（已分配时禁用）；
 * 区域选项每次打开都重新拉取——区域规划新增/改名后立即可见，无需切换页面 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  workstation: Workstation | null
  /** 新增时的默认类型（办公位管理页传 open、办公室管理页传 office） */
  defaultType?: WorkstationType
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()
const areaOptions = ref<{ label: string; value: string }[]>([])
/* 区域选项加载失败：内联提示 + 重试（替代仅 toast，用户可感知并自行恢复） */
const optionLoadError = ref('')

async function loadAreaOptions() {
  try {
    const areas = await fetchWorkstationAreas()
    areaOptions.value = areas.map((a) => ({ label: a.name, value: a.name }))
    optionLoadError.value = ''
  } catch (e) {
    optionLoadError.value = e instanceof Error ? e.message : '区域选项加载失败'
  }
}

const form = reactive({
  area: '',
  seatNo: '',
  type: 'open' as WorkstationType,
  capacity: 1,
  maintenance: false,
  note: '',
  defaultMonthlyRent: undefined as number | undefined,
  areaSqm: undefined as number | undefined,
})

/* 打开弹窗时的维护状态，用于判断保存时是否需要调用状态接口 */
const initialMaintenance = ref(false)

/* 未保存保护：打开时记录基线，关闭前有改动需确认 */
const { markBaseline, guardClose } = useDialogDirtyGuard(form)

const typeOptions = Object.entries(workstationTypeMap).map(([value, label]) => ({ label, value }))

const seatNoTip = computed(() =>
  props.mode === 'create' ? '不可重复，建议「区域前缀-序号」…' : '',
)

/* 已分配办公位不可删除（需先终止租约）；维护中/空闲可直接删除 */
const canDelete = computed(() => props.mode === 'edit' && props.workstation?.status !== 'assigned')

const maintenanceTip = computed(() => {
  if (props.mode === 'edit' && props.workstation?.status === 'assigned')
    return '已分配的办公位/办公室不可设为维护中，请先在「租赁管理」终止租约'
  return form.maintenance
    ? '当前维护中：暂停分配，关闭开关即可恢复空闲'
    : '开启后进入维护中状态，暂停分配'
})

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    /* 区域选项每次打开都重新拉取：区域规划新增/改名后立即可见（修复需切换页面才能读到新区域的问题） */
    await loadAreaOptions()
    if (props.mode === 'edit' && props.workstation) {
      form.area = props.workstation.area
      form.seatNo = props.workstation.seatNo
      form.type = props.workstation.type
      form.capacity = props.workstation.capacity
      form.maintenance = props.workstation.status === 'maintenance'
      initialMaintenance.value = form.maintenance
      form.note = props.workstation.note ?? ''
      form.defaultMonthlyRent = props.workstation.defaultMonthlyRent
      form.areaSqm = props.workstation.areaSqm
    } else {
      form.area = areaOptions.value[0]?.value ?? ''
      form.seatNo = ''
      form.type = props.defaultType ?? 'open'
      form.capacity = 1
      form.maintenance = false
      initialMaintenance.value = false
      form.note = ''
      form.defaultMonthlyRent = undefined
      form.areaSqm = undefined
    }
    /* 记录基线 + 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    markBaseline()
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  area: [{ required: true, message: '请选择所属区域', trigger: 'submit' }],
  seatNo: [{ required: true, message: '请输入办公位编号', trigger: 'submit' }],
  type: [{ required: true, message: '请选择办公位类型', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload = {
      area: form.area,
      seatNo: form.seatNo.trim(),
      type: form.type,
      capacity: form.capacity,
      note: form.note.trim() || undefined,
      defaultMonthlyRent: form.defaultMonthlyRent,
      areaSqm: form.type === 'office' ? form.areaSqm : undefined,
    }
    if (props.mode === 'create') {
      const ws = await createWorkstation(payload)
      MessagePlugin.success(`办公位已新增并置为空闲（${ws.id}），可在平面图中查看`)
    } else if (props.workstation) {
      await updateWorkstation(props.workstation.id, payload)
      /* 维护状态开关与打开时不一致时同步状态（已分配办公位开关已禁用，不会走到被拦分支） */
      if (form.maintenance !== initialMaintenance.value) {
        await setWorkstationStatus(props.workstation.id, form.maintenance ? 'maintenance' : 'idle')
      }
      MessagePlugin.success('办公位资料已保存')
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
  /* 未保存保护：有改动时弹确认（见 useDialogDirtyGuard） */
  guardClose(() => emit('update:visible', false))
}

/* 删除办公位（编辑模式专用）：成功后关闭弹窗并通知父级刷新 */
async function onDelete() {
  if (!props.workstation) return
  submitting.value = true
  try {
    await deleteWorkstation(props.workstation.id)
    MessagePlugin.success(`办公位 ${props.workstation.seatNo} 已删除`)
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <t-dialog
    :close-on-overlay-click="false"
    :visible="visible"
    :header="mode === 'create' ? '新增办公位' : '编辑办公位信息'"
    width="880px"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <!-- 编辑模式：删除办公位（已分配时禁用，悬浮提示原因） -->
        <t-tooltip v-if="mode === 'edit' && !canDelete" content="已分配的办公位不可删除，请先在「租赁管理」终止租约">
          <t-button theme="danger" variant="outline" disabled>删除办公位</t-button>
        </t-tooltip>
        <t-popconfirm
          v-else-if="mode === 'edit'"
          :content="`确认删除办公位「${workstation?.seatNo}」？删除后不可恢复`"
          :confirm-btn="{ content: '删除', theme: 'danger' }"
          @confirm="onDelete"
        >
          <t-button theme="danger" variant="outline" :loading="submitting">删除办公位</t-button>
        </t-popconfirm>
        <span class="footer-spacer" />
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认新增' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <!-- 区域选项加载失败：内联错误 + 重试（同步 LeaseFormDialog / AreaPlanDialog 同构） -->
      <t-alert v-if="optionLoadError" theme="error" style="margin-bottom: 12px">
        <div class="error-retry-line">{{ optionLoadError }}
          <t-button size="small" variant="text" theme="primary" @click="loadAreaOptions">重新加载</t-button>
        </div>
      </t-alert>
      <t-form-item label="所属区域" name="area">
        <t-select clearable v-model="form.area" :options="areaOptions" placeholder="区域在「区域规划」中维护…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="办公位编号" name="seatNo">
          <t-input clearable v-model="form.seatNo" :placeholder="seatNoTip" />
        </t-form-item>
        <t-form-item label="容纳人数" name="capacity">
          <t-input-number v-model="form.capacity" :min="1" theme="column" class="ctl-w-full" />
        </t-form-item>
      </div>
      <t-form-item label="办公位类型" name="type">
        <t-radio-group v-model="form.type" :options="typeOptions" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="默认月租（元）" name="defaultMonthlyRent">
          <t-input-number
            v-model="form.defaultMonthlyRent"
            :min="0"
            theme="column"
            class="ctl-w-full"
            placeholder="选填；月租租约自动累加用…"
          />
        </t-form-item>
        <t-form-item v-if="form.type === 'office'" label="面积（㎡）" name="areaSqm">
          <t-input-number v-model="form.areaSqm" :min="0" theme="column" class="ctl-w-full" placeholder="选填…" />
        </t-form-item>
      </div>
      <t-form-item label="备注" name="note">
        <t-textarea
          v-model="form.note"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="维护原因、使用注意事项等（选填）…"
        />
      </t-form-item>
      <t-form-item v-if="mode === 'edit'" label="维护状态" name="maintenance">
        <div class="maintenance-row">
          <t-switch v-model="form.maintenance" :disabled="props.workstation?.status === 'assigned'" />
          <span class="maintenance-tip">{{ maintenanceTip }}</span>
        </div>
      </t-form-item>
      <p v-if="mode === 'edit'" class="edit-tip">
        分配与退租请在「租赁管理」中处理。
      </p>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

/* 选项加载失败行：错误文案与「重新加载」按钮同行 */
.error-retry-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

/* 页脚左端有 .footer-spacer 占位，需保持按钮与说明文字垂直居中 */
.dialog-footer {
  align-items: center;
}

.footer-spacer {
  flex: 1;
}

.edit-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.maintenance-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.maintenance-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
