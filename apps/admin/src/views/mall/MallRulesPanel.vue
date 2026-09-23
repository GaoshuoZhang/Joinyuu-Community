<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import { fetchPointsRules, togglePointsRuleStatus, updatePointsRule } from '@/api/mall'
import type { PointsRule } from '@/types'

/* 积分规则面板：触发项写死（code 为后端关联标识），仅可编辑积分值与启停，不允许新增/删除 */
const loading = ref(false)
const loadError = ref('')
const list = ref<PointsRule[]>([])
const acting = ref('')
const router = useRouter()

const catalogue: Record<string, { category: string; beneficiary: string; cadence: string }> = {
  activity_checkin: { category: '活动参与', beneficiary: '签到成员', cadence: '每场活动一次' },
  activity_enroll_approved: { category: '活动参与', beneficiary: '报名成员', cadence: '每次通过报名' },
  article_accepted: { category: '内容共建', beneficiary: '投稿方', cadence: '每篇采纳一次' },
  demand_published: { category: '需求协作', beneficiary: '需求提交人', cadence: '每次成功发布' },
  demand_responded: { category: '需求协作', beneficiary: '响应成员', cadence: '每次有效响应' },
  demand_undertaken: { category: '需求协作', beneficiary: '承接方', cadence: '每次承接立项' },
  project_milestone: { category: '项目履约', beneficiary: '负责承接方', cadence: '每个里程碑一次' },
  identity_first_bind: { category: '身份成长', beneficiary: '首次绑定用户', cadence: '每位用户一次' },
  daily_login: { category: '日常活跃', beneficiary: '登录用户', cadence: '每日首次登录' },
}

/* 分类分组：按 catalogue 定义顺序排序聚簇，「其他」兜底置尾 */
const categoryOrder = [...new Set([...Object.values(catalogue).map((c) => c.category), '其他'])]

const rows = computed(() => list.value
  .map(rule => ({
    ...rule,
    category: catalogue[rule.code]?.category ?? '其他',
    beneficiary: catalogue[rule.code]?.beneficiary ?? '行为用户',
    cadence: catalogue[rule.code]?.cadence ?? '按触发事件',
  }))
  .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)))

/* 规则分类列纵向合并：每组首行向下合并同分类行，被覆盖单元格由表格自动跳过 */
function onCategorySpan({ col, rowIndex }: { col: { colKey?: string }; rowIndex: number }) {
  if (col.colKey !== 'category') return
  if (rowIndex > 0 && rows.value[rowIndex - 1].category === rows.value[rowIndex].category) return
  let count = 1
  while (rowIndex + count < rows.value.length && rows.value[rowIndex + count].category === rows.value[rowIndex].category) count++
  return { rowspan: count }
}

const columns = [
  /* 分类列有 rowspan 纵向合并，拖拽改宽会破坏合并显示，故禁用该列列宽调整 */
  { colKey: 'category', title: '规则分类', width: 110, resizable: false },
  { colKey: 'name', title: '触发项', cell: 'name', width: 180, resizable: true, ellipsis: true },
  { colKey: 'scene', title: '触发条件', ellipsis: true, width: 180 },
  { colKey: 'beneficiary', title: '发放对象', width: 120 },
  { colKey: 'cadence', title: '发放频次', width: 135 },
  { colKey: 'points', title: '积分', cell: 'points', width: 90, resizable: true , ellipsis: true},
  { colKey: 'description', title: '说明', ellipsis: true, width: 260, resizable: true },
  { colKey: 'status', title: '状态', cell: 'status', width: 95 , ellipsis: true},
  { colKey: 'updatedAt', title: '更新时间', width: 160, resizable: true , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 160 },
]

async function load() {
  loading.value = true
  try {
    list.value = await fetchPointsRules()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

/* 启用 / 停用（停用后该行为不再发放/扣减积分） */
async function onToggle(row: PointsRule) {
  acting.value = row.code
  /* 先取旧状态再调接口：接口原地更新了 row.status，后再判断会拿到新值导致提示反转 */
  const wasEnabled = row.status === 'enabled'
  try {
    await togglePointsRuleStatus(row.code)
    MessagePlugin.success(wasEnabled ? '规则已停用' : '规则已启用')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 编辑弹窗：仅积分值可改（触发项/方向/名称/说明写死），积分值为正整数 */
const dialogVisible = ref(false)
const currentRule = ref<PointsRule | null>(null)
const submitting = ref(false)
const formRef = ref()

const form = reactive({
  points: 10,
})

const rules: FormProps['rules'] = {
  points: [{ required: true, message: '请填写积分值', trigger: 'submit' }],
}

function openEdit(row: PointsRule) {
  currentRule.value = row
  form.points = row.points
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  if (!currentRule.value) return
  submitting.value = true
  try {
    await updatePointsRule(currentRule.value.code, { points: form.points })
    MessagePlugin.success(`规则「${currentRule.value.name}」积分已更新为 ${form.points}`)
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
  <div class="rules-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="积分规则" description="积分发放制度：触发项固定，发放自动；扣除积分由管理员手动调整">
      <template #actions><t-button variant="outline" @click="router.push('/rules/ledger')">积分发放记录</t-button></template>
    </PageHeader>

    <!-- 纯说明文案不是筛选条件：用 info 提示条承载，避免被误读为筛选区 -->
    <t-alert theme="info" class="rule-note">
      触发项为固定制度（不可新增/删除），完成对应行为时自动发放积分；扣除积分不设自动规则，由管理员在积分流水手动调整；停用规则不影响已发放积分。
    </t-alert>

    <div class="page-card">
      <t-table
        row-key="code"
        table-layout="fixed"
        hover
        resizable
        :disable-data-page="true"
        :data="rows"
        :columns="columns"
        :loading="loading"
        :rowspan-and-colspan="onCategorySpan"
        empty="暂无积分规则"
      >
        <template #name="{ row }">
          <div class="cell-title">{{ row.name }}</div>
          <div class="cell-sub">{{ row.code }}</div>
        </template>
        <template #points="{ row }">
          <span class="delta-add">+{{ row.points }}</span>
        </template>
        <template #status="{ row }">
          <StatusTag entity="rule" :value="row.status" />
        </template>
        <template #op="{ row }">
          <div class="op-cell">
            <t-button variant="text" size="small" @click="openEdit(row)">编辑积分</t-button>
            <t-popconfirm
              v-if="row.status === 'enabled'"
              content="确认停用该规则？停用后该行为不再加/减积分"
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

    <!-- 编辑弹窗：仅积分值可改，触发项与说明只读展示 -->
    <t-dialog
      :visible="dialogVisible"
      :header="currentRule ? `编辑积分 · ${currentRule.name}` : '编辑积分'"
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
        <t-form-item label="发放积分（N）" name="points">
          <t-input-number v-model="form.points" :min="1" :decimal-places="0" theme="column" class="ctl-w-full" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.rule-note {
  margin-bottom: 16px;
}

.delta-add {
  color: var(--td-success-color);
  font-weight: 600;
}

.rule-desc {
  margin-bottom: 16px;
}
</style>
