<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import {
  createWorkstationArea,
  deleteWorkstationArea,
  fetchWorkstationAreas,
  fetchWorkstations,
  updateWorkstationArea,
} from '@/api/workstations'
import { workstationTypeMap } from '@/constants/status'
import type { Workstation, WorkstationArea, WorkstationType } from '@/types'

/* 区域规划弹窗（办公位管理/办公室管理两页共用）：
 * 区域列表（含各区域办公位数）+ 新增/编辑/删除；办公位.area 存区域名称，
 * 改名由 API 层级联刷新（改存 areaId 后无需级联）；区域下仍有办公位时禁止删除 */
const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()
const areas = ref<WorkstationArea[]>([])
/* 区域列表为异步拉取：加载中 areas 仍为空，需与"确实没有区域"区分 */
const areasLoading = ref(false)
/* 区域数据加载失败：内联提示 + 重试 */
const optionLoadError = ref('')
const workstations = ref<Workstation[]>([])
/* null = 新增模式；否则为编辑中的区域 ID */
const editingId = ref<string | null>(null)

const form = reactive({
  name: '',
  type: 'open' as WorkstationType,
  description: '',
})

/* 未保存保护：新增/编辑表单记录基线，关闭前有改动需确认 */
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(form)

const typeOptions = Object.entries(workstationTypeMap).map(([value, label]) => ({ label, value }))

const editingArea = computed(() => areas.value.find((a) => a.id === editingId.value) ?? null)

function countByArea(areaName: string): number {
  return workstations.value.filter((w) => w.area === areaName).length
}

watch(
  () => props.visible,
  (v) => {
    ++loadVersion
    if (!v) return
    resetForm()
    void load()
    nextTick(() => formRef.value?.clearValidate())
  },
)

let loadVersion = 0
async function load() {
  const version = ++loadVersion
  areasLoading.value = true
  try {
    const [areaList, wsList] = await Promise.all([fetchWorkstationAreas(), fetchWorkstations()])
    if (version !== loadVersion || !props.visible) return
    areas.value = areaList
    workstations.value = wsList
    optionLoadError.value = ''
  } catch (e) {
    if (version !== loadVersion || !props.visible) return
    /* 内联错误 + 重试（替代仅 toast，与 WorkstationFormDialog/LeaseFormDialog 同构） */
    optionLoadError.value = e instanceof Error ? e.message : '区域数据加载失败'
  } finally {
    if (version === loadVersion) areasLoading.value = false
  }
}

function resetForm() {
  editingId.value = null
  form.name = ''
  form.type = 'open'
  form.description = ''
  markBaseline()
  nextTick(() => formRef.value?.clearValidate())
}

function openEdit(area: WorkstationArea) {
  if (submitting.value) return
  guardClose(() => applyEdit(area), '切换')
}

function applyEdit(area: WorkstationArea) {
  editingId.value = area.id
  form.name = area.name
  form.type = area.type
  form.description = area.description
  markBaseline()
  nextTick(() => formRef.value?.clearValidate())
}

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入区域名称', trigger: 'submit' }],
  type: [{ required: true, message: '请选择区域主类型', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload = { name: form.name.trim(), type: form.type, description: form.description }
    if (editingId.value) {
      await updateWorkstationArea(editingId.value, payload)
      MessagePlugin.success('区域已保存，区域内办公位的所属区域已同步更新')
    } else {
      const area = await createWorkstationArea(payload)
      MessagePlugin.success(`区域已新增（${area.id}），可通过「新增办公位」向区域内新增办公位`)
    }
    emit('success')
    await load()
    resetForm()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

async function onDelete(area: WorkstationArea) {
  try {
    await deleteWorkstationArea(area.id)
    MessagePlugin.success(`区域「${area.name}」已删除`)
    emit('success')
    await load()
    if (editingId.value === area.id) resetForm()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  }
}

function onClose() {
  /* 未保存保护：表单有改动时弹确认（见 useDialogDirtyGuard） */
  guardClose(() => emit('update:visible', false))
}
usePageDirtyGuard(computed(() => props.visible && isDirty.value))
</script>

<template>
  <t-dialog
    :close-on-overlay-click="false"
    :visible="visible"
    header="区域规划"
    width="880px"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">关闭</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ editingId ? '保存修改' : '新增区域' }}
        </t-button>
      </div>
    </template>

    <!-- 区域数据加载失败：内联错误 + 重试（同步 WorkstationFormDialog / LeaseFormDialog 同构） -->
    <t-alert v-if="optionLoadError" theme="error" style="margin-bottom: 12px">
      <div class="error-retry-line">{{ optionLoadError }}
        <t-button size="small" variant="text" theme="primary" @click="load">重新加载</t-button>
      </div>
    </t-alert>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top" class="area-form">
      <div class="form-head">
        <span class="form-title">{{ editingId ? `编辑区域：${editingArea?.name ?? ''}` : '新增区域' }}</span>
        <t-button v-if="editingId" variant="text" size="small" :disabled="submitting" @click="guardClose(resetForm, '取消编辑')">取消编辑</t-button>
      </div>
      <div class="form-row">
        <t-form-item label="区域名称" name="name">
          <t-input v-accessible-field v-model="form.name" placeholder="如 D 区 · 创客办公位…" />
        </t-form-item>
        <t-form-item label="区域主类型" name="type">
          <t-select v-accessible-field clearable v-model="form.type" :options="typeOptions" />
        </t-form-item>
      </div>
      <t-form-item label="区域说明" name="description">
        <t-textarea
          v-accessible-field
          v-model="form.description"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="区域位置与用途说明（可选）…"
        />
      </t-form-item>
    </t-form>

    <div class="area-list">
      <div class="area-list-title">已有区域（{{ areas.length }}）</div>
      <t-list :split="true">
        <t-list-item
          v-for="area in areas"
          :key="area.id"
          :class="{ 'is-editing': editingId === area.id }"
        >
          <div class="area-info">
            <div class="area-name">
              {{ area.name }}
              <t-tag variant="light" size="small">{{ workstationTypeMap[area.type] ?? area.type }}</t-tag>
              <t-tag variant="outline" size="small">{{ countByArea(area.name) }} 个办公位</t-tag>
            </div>
            <div class="area-desc">{{ area.description || '暂无说明' }}</div>
          </div>
          <template #action>
            <div class="area-op">
              <t-button variant="text" size="small" @click="openEdit(area)">编辑</t-button>
              <t-popconfirm
                :content="`确认删除区域「${area.name}」？区域下仍有办公位时将无法删除`"
                :confirm-btn="{ content: '删除', theme: 'danger' }"
                @confirm="onDelete(area)"
              >
                <t-button variant="text" size="small" theme="danger">删除</t-button>
              </t-popconfirm>
            </div>
          </template>
        </t-list-item>
      </t-list>
      <div v-if="!areasLoading && areas.length === 0" class="area-empty">
        暂无区域，请先在上方新增区域，再通过「新增办公位」新增办公位。
      </div>
    </div>
  </t-dialog>
</template>

<style scoped>

.form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

/* 区块标题须强于其下条目（.area-name 为 14px/500），否则层级倒挂 */
.form-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

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

.area-list {
  margin-top: 8px;
  border-top: 1px solid var(--td-component-border);
  padding-top: 12px;
}

.area-list-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 400;
  color: var(--td-text-color-primary);
}

/* 编辑态高亮：.is-editing 为自有状态类，叠加在 t-list-item 根节点上；须 :deep 穿透子组件根 */
.area-list :deep(.t-list-item.is-editing) {
  background: var(--td-brand-color-1);
}

.area-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.area-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.area-op {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  flex-shrink: 0;
}

.area-empty {
  padding: 16px 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
