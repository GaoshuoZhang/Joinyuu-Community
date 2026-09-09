<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import { fetchExperienceRules, toggleExperienceRuleStatus, updateExperienceRule } from '@/api/rules'
import type { ExperienceRule } from '@/types'

/* 经验值规则面板：触发项写死（code 为后端关联标识），仅可编辑经验值与启停，不允许新增/删除 */
const loading = ref(false)
const list = ref<ExperienceRule[]>([])
const acting = ref('')

const columns = [
  { colKey: 'name', title: '触发项', cell: 'name', minWidth: 180, resizable: true },
  { colKey: 'scene', title: '行为场景', ellipsis: true, minWidth: 170 },
  { colKey: 'exp', title: '经验值', cell: 'exp', width: 100, resizable: true },
  { colKey: 'description', title: '说明', ellipsis: true, width: 260, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 95 },
  { colKey: 'updatedAt', title: '更新时间', width: 145, resizable: true },
  { colKey: 'op', title: '操作', cell: 'op', width: 130 },
]

async function load() {
  loading.value = true
  try {
    list.value = await fetchExperienceRules()
  } finally {
    loading.value = false
  }
}

/* 启用 / 停用（停用后该行为不再累积经验） */
async function onToggle(row: ExperienceRule) {
  acting.value = row.code
  try {
    await toggleExperienceRuleStatus(row.code)
    MessagePlugin.success(row.status === 'enabled' ? '规则已停用' : '规则已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 编辑弹窗：仅经验值可改（触发项/名称/说明写死），正整数 */
const dialogVisible = ref(false)
const currentRule = ref<ExperienceRule | null>(null)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  exp: 5,
})

const rules: FormProps['rules'] = {
  exp: [{ required: true, message: '请填写经验值', trigger: 'submit' }],
}

function openEdit(row: ExperienceRule) {
  currentRule.value = row
  form.exp = row.exp
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  if (!currentRule.value) return
  submitting.value = true
  try {
    await updateExperienceRule(currentRule.value.code, { exp: form.exp })
    MessagePlugin.success(`规则「${currentRule.value.name}」经验值已更新为 ${form.exp}`)
    dialogVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="exp-rules-panel page-fade-in">
    <PageHeader title="经验值规则" description="经验值发放制度：触发项固定，发放自动；扣除经验值由管理员手动调整" />

    <div class="page-filter-bar">
      <span class="panel-tip">
        触发项为固定制度（不可新增/删除），完成对应行为时自动累积经验值（仅社区个体/社区企业身份持有经验）；停用规则不影响已发放经验。
      </span>
      <t-button variant="outline" style="margin-left: auto">
        <template #icon><RefreshIcon /></template>
        刷新
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="code"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        empty="暂无经验值规则"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.code }}</div>
        </template>
        <template #exp="{ row }">
          <span class="exp-add">+{{ row.exp }}</span>
        </template>
        <template #status="{ row }">
          <StatusTag entity="rule" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button variant="text" size="small" @click="openEdit(row)">编辑经验</t-button>
            <t-popconfirm
              v-if="row.status === 'enabled'"
              content="确认停用该规则？停用后该行为不再累积经验"
              @confirm="onToggle(row)"
            >
              <t-button variant="text" size="small" theme="danger" :loading="acting === row.code">
                停用
              </t-button>
            </t-popconfirm>
            <t-button
              v-else
              variant="text"
              size="small"
              theme="primary"
              :loading="acting === row.code"
              @click="onToggle(row)"
            >
              启用
            </t-button>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 编辑弹窗：仅经验值可改，触发项与说明只读展示 -->
    <t-dialog
      :visible="dialogVisible"
      :header="currentRule ? `编辑经验值 · ${currentRule.name}` : '编辑经验值'"
      width="460px"
      @close="dialogVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="dialogVisible = false">取消</t-button>
          <t-button theme="primary" :loading="submitting" @click="onConfirm">保存修改</t-button>
        </div>
      </template>
      <t-descriptions :column="1" bordered class="rule-desc">
        <t-descriptions-item label="触发项">{{ currentRule?.name }}</t-descriptions-item>
        <t-descriptions-item label="行为场景">{{ currentRule?.scene }}</t-descriptions-item>
        <t-descriptions-item label="规则说明">{{ currentRule?.description || '—' }}</t-descriptions-item>
      </t-descriptions>
      <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
        <t-form-item label="发放经验值（N）" name="exp">
          <t-input-number v-model="form.exp" :min="1" theme="column" style="width: 100%" />
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

.exp-add {
  color: var(--td-brand-color);
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

.rule-desc {
  margin-bottom: 16px;
}
</style>
