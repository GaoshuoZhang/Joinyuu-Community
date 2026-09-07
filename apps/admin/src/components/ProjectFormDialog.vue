<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import { fetchUndertakerOptions, initiateProject, type UndertakerOption } from '@/api/demands'
import { createProject, saveProjectDraft } from '@/api/projects'
import type { Demand, MilestoneInput, Project } from '@/types'

/* 项目表单弹窗（创建 / 需求立项共用）：
 * - demand 为 null：后台直接创建项目
 * - demand 非空：需求立项，创建后与需求双向关联
 * 多承接方 + 承接占比（默认均分，除不尽时首个取余数）+ 里程碑（每节点可多选负责承接方） */
const props = defineProps<{
  visible: boolean
  demand: Demand | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()
const undertakerOptions = ref<UndertakerOption[]>([])

const form = reactive({
  projectName: '',
  undertakers: [] as string[],
  startDate: '',
  endDate: '',
  description: '',
})

/* 与 form.undertakers 选择顺序对齐的占比数组 */
const shares = ref<number[]>([])

interface MilestoneRow {
  name: string
  date: string
  owners: string[]
}

const milestones = ref<MilestoneRow[]>([{ name: '', date: '', owners: [] }])

/* 均分：整数百分比，除不尽时首个承接方取余数（3 个 → 34/33/33） */
function evenShares(n: number): number[] {
  const base = Math.floor(100 / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? 100 - base * (n - 1) : base))
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      form.projectName = props.demand?.title ?? ''
      form.undertakers = []
      form.startDate = ''
      form.endDate = ''
      form.description = props.demand?.description ?? ''
      shares.value = []
      milestones.value = [{ name: '', date: '', owners: [] }]
      /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
      nextTick(() => formRef.value?.clearValidate())
    }
  },
)

/* 承接方选择变化 → 重置为均分 */
watch(
  () => [...form.undertakers],
  (sel) => {
    shares.value = evenShares(sel.length)
  },
)

/* 已选承接方（保持选择顺序） */
const selectedUndertakers = computed(() =>
  form.undertakers
    .map((v) => undertakerOptions.value.find((o) => o.value === v))
    .filter((o): o is UndertakerOption => !!o),
)

/* 里程碑负责方候选 = 已选承接方 */
const ownerOptions = computed(() => selectedUndertakers.value.map((o) => ({ label: o.label, value: o.label })))

const shareSum = computed(() => shares.value.reduce((s, v) => s + (Number(v) || 0), 0))

/* 规则 trigger 一律 submit：值变化(change)/失焦(blur)的自动校验全部跳过——
 * 弹窗打开重置表单或 DatePicker 面板交互均不会提前红框；确认时 formRef.validate()
 * 默认 trigger='all' 会命中全部规则，此时才红框提示 */
const rules: FormProps['rules'] = {
  projectName: [{ required: true, message: '请输入项目名称', trigger: 'submit' }],
  undertakers: [
    {
      validator: (val: string[]) => !!val && val.length > 0,
      message: '请选择至少一个承接方',
      trigger: 'submit',
    },
  ],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'submit' }],
  endDate: [{ required: true, message: '请选择结束日期', trigger: 'submit' }],
}

async function loadOptions() {
  undertakerOptions.value = await fetchUndertakerOptions()
}
loadOptions()

function addMilestone() {
  milestones.value.push({ name: '', date: '', owners: [] })
}

function removeMilestone(i: number) {
  milestones.value.splice(i, 1)
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  if (shares.value.some((s) => !Number.isInteger(s) || s < 0) || shareSum.value !== 100) {
    MessagePlugin.warning('承接占比须为不小于 0 的整数，且合计为 100%')
    return
  }
  submitting.value = true
  try {
    const payload = {
      undertakers: form.undertakers.map((v, i) => {
        const [type, id] = v.split(':')
        return { type: type as 'enterprise' | 'individual', id, share: shares.value[i] }
      }),
      projectName: form.projectName,
      startDate: form.startDate,
      endDate: form.endDate,
      description: form.description,
      milestones: milestones.value.map((m): MilestoneInput => ({ name: m.name, date: m.date, owners: m.owners })),
    }
    let project: Project
    if (props.demand) {
      project = await initiateProject(props.demand.id, payload)
      MessagePlugin.success(`立项成功，项目编号 ${project.code}`)
    } else {
      project = await createProject(payload)
      MessagePlugin.success(`项目已创建，编号 ${project.code}`)
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

/* 保存草稿：不校验必填项（承接占比可为空/不满 100） */
const draftSaving = ref(false)

async function onSaveDraft() {
  if (props.demand) return
  draftSaving.value = true
  try {
    const project = await saveProjectDraft({
      undertakers: form.undertakers.map((v, i) => {
        const [type, id] = v.split(':')
        return { type: type as 'enterprise' | 'individual', id, share: shares.value[i] ?? 0 }
      }),
      projectName: form.projectName,
      startDate: form.startDate,
      endDate: form.endDate,
      description: form.description,
      milestones: milestones.value.map((m) => ({ name: m.name, date: m.date, owners: m.owners })),
    })
    MessagePlugin.success(`草稿已保存（${project.id}），可在项目列表中继续完善`)
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '草稿保存失败')
  } finally {
    draftSaving.value = false
  }
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="demand ? '需求立项' : '创建项目'"
    width="680px"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button
          v-if="!demand"
          variant="outline"
          theme="default"
          :loading="draftSaving"
          @click="onSaveDraft"
        >
          存草稿
        </t-button>
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ demand ? '确认立项' : '确认创建' }}
        </t-button>
      </div>
    </template>
    <p v-if="demand" class="demand-context">立项需求：{{ demand.title }}（{{ demand.id }}）</p>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="项目名称" name="projectName">
        <t-input v-model="form.projectName" placeholder="需求立项默认取需求标题，可修改" />
      </t-form-item>
      <t-form-item label="承接方（可多选：社区企业 / 社区个人）" name="undertakers">
        <t-select
          v-model="form.undertakers"
          multiple
          filterable
          :options="undertakerOptions"
          placeholder="搜索或选择承接方，可多选"
        />
      </t-form-item>

      <!-- 承接占比 -->
      <div v-if="selectedUndertakers.length" class="share-block">
        <div class="share-head">
          <span class="share-title">承接占比</span>
          <span class="share-tip">默认均分（除不尽时首个承接方取余数），调整承接方后将重置</span>
        </div>
        <div v-for="(opt, i) in selectedUndertakers" :key="opt.value" class="share-row">
          <span class="share-name">{{ opt.label }}</span>
          <t-input-number
            v-model="shares[i]"
            :min="0"
            :max="100"
            :step="1"
            theme="column"
            style="width: 120px"
          />
          <span class="share-unit">%</span>
        </div>
        <div class="share-sum" :class="{ error: shareSum !== 100 }">
          合计：{{ shareSum }}%<template v-if="shareSum !== 100">（须为 100%）</template>
        </div>
      </div>

      <div class="form-row">
        <t-form-item label="开始日期" name="startDate">
          <t-date-picker v-model="form.startDate" style="width: 100%" />
        </t-form-item>
        <t-form-item label="结束日期" name="endDate">
          <t-date-picker v-model="form.endDate" style="width: 100%" />
        </t-form-item>
      </div>
      <t-form-item label="项目说明" name="description">
        <t-textarea v-model="form.description" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="项目说明" />
      </t-form-item>

      <div class="milestone-block">
        <div class="milestone-head">
          <span class="milestone-label">里程碑节点（可选）</span>
          <t-button variant="dashed" size="small" @click="addMilestone">
            <template #icon><AddIcon /></template>
            添加节点
          </t-button>
        </div>
        <div v-for="(m, i) in milestones" :key="i" class="milestone-row">
          <t-input v-model="m.name" placeholder="节点名称，如「方案设计」" />
          <t-date-picker v-model="m.date" placeholder="日期" />
          <t-button variant="text" theme="danger" size="small" @click="removeMilestone(i)">
            <template #icon><DeleteIcon /></template>
          </t-button>
          <t-select
            v-model="m.owners"
            multiple
            clearable
            :options="ownerOptions"
            placeholder="负责方（可多选）"
            class="milestone-owners"
          />
        </div>
      </div>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.demand-context {
  margin: 0 0 16px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
  border-radius: 6px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.share-block {
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
}

.share-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.share-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.share-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.share-row {
  display: grid;
  grid-template-columns: 1fr 120px 20px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.share-name {
  font-size: 13px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-unit {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.share-sum {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.share-sum.error {
  color: var(--td-error-color);
}

.milestone-block {
  margin-top: 4px;
}

.milestone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.milestone-label {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.milestone-row {
  display: grid;
  grid-template-columns: 1fr 170px auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.milestone-owners {
  grid-column: 1 / -1;
}
</style>
