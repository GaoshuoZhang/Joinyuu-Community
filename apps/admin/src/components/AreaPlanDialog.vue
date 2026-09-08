<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
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
 * 区域列表（含各区域工位数）+ 新增/编辑/删除；工位.area 存区域名称，
 * 改名由 API 层级联刷新（M1 改存 areaId 后无需级联）；区域下仍有工位时禁止删除 */
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
const workstations = ref<Workstation[]>([])
/* null = 新增模式；否则为编辑中的区域 ID */
const editingId = ref<string | null>(null)

const form = reactive({
  name: '',
  type: 'open' as WorkstationType,
  description: '',
})

const typeOptions = Object.entries(workstationTypeMap).map(([value, label]) => ({ label, value }))

const editingArea = computed(() => areas.value.find((a) => a.id === editingId.value) ?? null)

function countByArea(areaName: string): number {
  return workstations.value.filter((w) => w.area === areaName).length
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    await load()
    resetForm()
    nextTick(() => formRef.value?.clearValidate())
  },
)

async function load() {
  try {
    const [areaList, wsList] = await Promise.all([fetchWorkstationAreas(), fetchWorkstations()])
    areas.value = areaList
    workstations.value = wsList
  } catch {
    MessagePlugin.error('区域数据加载失败')
  }
}

function resetForm() {
  editingId.value = null
  form.name = ''
  form.type = 'open'
  form.description = ''
  nextTick(() => formRef.value?.clearValidate())
}

function openEdit(area: WorkstationArea) {
  editingId.value = area.id
  form.name = area.name
  form.type = area.type
  form.description = area.description
  nextTick(() => formRef.value?.clearValidate())
}

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入区域名称', trigger: 'submit' }],
  type: [{ required: true, message: '请选择区域主类型', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    const payload = { name: form.name.trim(), type: form.type, description: form.description }
    if (editingId.value) {
      await updateWorkstationArea(editingId.value, payload)
      MessagePlugin.success('区域已保存，区域内工位的所属区域已同步更新')
    } else {
      const area = await createWorkstationArea(payload)
      MessagePlugin.success(`区域已创建（${area.id}），可通过「创建办公位」向区域内添加工位`)
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
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog :visible="visible" header="区域规划" width="680px" @close="onClose">
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">关闭</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ editingId ? '保存修改' : '创建区域' }}
        </t-button>
      </div>
    </template>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top" class="area-form">
      <div class="form-head">
        <span class="form-title">{{ editingId ? `编辑区域：${editingArea?.name ?? ''}` : '新增区域' }}</span>
        <t-button v-if="editingId" variant="text" size="small" @click="resetForm">取消编辑</t-button>
      </div>
      <div class="form-row">
        <t-form-item label="区域名称" name="name">
          <t-input v-model="form.name" placeholder="如 D 区 · 创客工位" />
        </t-form-item>
        <t-form-item label="区域主类型" name="type">
          <t-select v-model="form.type" :options="typeOptions" />
        </t-form-item>
      </div>
      <t-form-item label="区域说明" name="description">
        <t-textarea
          v-model="form.description"
          :autosize="{ minRows: 2, maxRows: 4 }"
          placeholder="区域位置与用途说明（可选）"
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
              <t-tag variant="outline" size="small">{{ countByArea(area.name) }} 个工位</t-tag>
            </div>
            <div class="area-desc">{{ area.description || '暂无说明' }}</div>
          </div>
          <template #action>
            <div class="area-op">
              <t-button variant="text" size="small" @click="openEdit(area)">编辑</t-button>
              <t-popconfirm
                content="确认删除该区域？区域下仍有工位时将无法删除"
                @confirm="onDelete(area)"
              >
                <t-button variant="text" size="small" theme="danger">删除</t-button>
              </t-popconfirm>
            </div>
          </template>
        </t-list-item>
      </t-list>
      <div v-if="areas.length === 0" class="area-empty">
        暂无区域，请先在上方创建区域，再通过「创建办公位」添加工位。
      </div>
    </div>
  </t-dialog>
</template>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

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

.area-list {
  margin-top: 8px;
  border-top: 1px solid var(--td-component-border);
  padding-top: 12px;
}

.area-list-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

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
