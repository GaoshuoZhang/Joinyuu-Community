<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import { createPointsRule, fetchPointsRules, togglePointsRuleStatus, updatePointsRule } from '@/api/mall'
import type { PointsRule } from '@/types'

/* 积分规则面板：行为场景的积分发放配置 + 启用/停用；创建/编辑弹窗遵循表单契约 */
const loading = ref(false)
const list = ref<PointsRule[]>([])
const acting = ref('')

const columns = [
  { colKey: 'name', title: '规则', cell: 'name', minWidth: 200, resizable: true },
  { colKey: 'scene', title: '行为场景', ellipsis: true },
  { colKey: 'points', title: '积分', cell: 'points', width: 90, resizable: true },
  { colKey: 'description', title: '说明', ellipsis: true, width: 260, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 100, resizable: true },
  { colKey: 'updatedAt', title: '更新时间', width: 150, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 130 },
]

async function load() {
  loading.value = true
  try {
    list.value = await fetchPointsRules()
  } finally {
    loading.value = false
  }
}

/* 启用 / 停用 */
async function onToggle(row: PointsRule) {
  acting.value = row.id
  try {
    await togglePointsRuleStatus(row.id)
    MessagePlugin.success(row.status === 'enabled' ? '规则已停用' : '规则已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 创建 / 编辑规则弹窗（面板内表单，契约与共享弹窗一致） */
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const currentRule = ref<PointsRule | null>(null)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  name: '',
  scene: '',
  points: 10,
  description: '',
})

watch(dialogVisible, (v) => {
  if (!v) return
  if (dialogMode.value === 'edit' && currentRule.value) {
    form.name = currentRule.value.name
    form.scene = currentRule.value.scene
    form.points = currentRule.value.points
    form.description = currentRule.value.description ?? ''
  } else {
    form.name = ''
    form.scene = ''
    form.points = 10
    form.description = ''
  }
  nextTick(() => formRef.value?.clearValidate())
})

/* 规则 trigger 一律 submit：确认时 formRef.validate() 才触发红框提示 */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入规则名称', trigger: 'submit' }],
  scene: [{ required: true, message: '请输入行为场景', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    const payload = {
      name: form.name,
      scene: form.scene,
      points: form.points,
      description: form.description || undefined,
    }
    if (dialogMode.value === 'create') {
      const rule = await createPointsRule(payload)
      MessagePlugin.success(`积分规则已创建并启用（${rule.id}）`)
    } else if (currentRule.value) {
      await updatePointsRule(currentRule.value.id, payload)
      MessagePlugin.success('积分规则已保存')
    }
    dialogVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function openCreate() {
  dialogMode.value = 'create'
  currentRule.value = null
  dialogVisible.value = true
}

function openEdit(row: PointsRule) {
  dialogMode.value = 'edit'
  currentRule.value = row
  dialogVisible.value = true
}

onMounted(load)
</script>

<template>
  <div class="rules-panel page-fade-in">
    <PageHeader title="积分规则" description="用户行为场景的积分发放规则配置" />

    <div class="page-filter-bar">
      <span class="panel-tip">用户完成对应行为时按启用的规则自动发放积分；停用规则不影响已发放积分。</span>
      <t-button variant="outline" style="margin-left: auto">
        <template #icon><RefreshIcon /></template>
        刷新
      </t-button>
      <t-button theme="primary" @click="openCreate">
        <template #icon><AddIcon /></template>
        新增规则
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        empty="暂无积分规则"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.id }}</div>
        </template>
        <template #points="{ row }">
          <span class="delta-add">+{{ row.points }}</span>
        </template>
        <template #status="{ row }">
          <StatusTag entity="rule" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
            <t-popconfirm
              v-if="row.status === 'enabled'"
              content="确认停用该规则？停用后该行为不再发放积分"
              @confirm="onToggle(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.id">
                停用
              </t-button>
            </t-popconfirm>
            <t-button
              v-else
              variant="text"
              size="small"
              theme="primary"
              :loading="acting === row.id"
              @click="onToggle(row)"
            >
              启用
            </t-button>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 创建 / 编辑规则弹窗 -->
    <t-dialog
      :visible="dialogVisible"
      :header="dialogMode === 'create' ? '新增积分规则' : '编辑积分规则'"
      width="520px"
      @close="dialogVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="dialogVisible = false">取消</t-button>
          <t-button theme="primary" :loading="submitting" @click="onConfirm">
            {{ dialogMode === 'create' ? '确认创建' : '保存修改' }}
          </t-button>
        </div>
      </template>
      <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
        <t-form-item label="规则名称" name="name">
          <t-input clearable v-model="form.name" placeholder="如 活动签到" />
        </t-form-item>
        <div class="form-row">
          <t-form-item label="行为场景" name="scene">
            <t-input clearable v-model="form.scene" placeholder="如 参加活动并完成签到" />
          </t-form-item>
          <t-form-item label="发放积分" name="points">
            <t-input-number v-model="form.points" :min="1" theme="column" style="width: 100%" />
          </t-form-item>
        </div>
        <t-form-item label="规则说明" name="description">
          <t-textarea
            v-model="form.description"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="发放条件与限制说明（可选）"
          />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cell-title {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.cell-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.delta-add {
  color: var(--td-success-color);
  font-weight: 600;
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
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
</style>
