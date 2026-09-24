<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import { fetchPublishLimits, savePublishLimits } from '@/api/rules'
import type { PublishLimitRule, PublishLimitScope } from '@/types'

const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
type EditablePublishLimitRule = PublishLimitRule & { key: string }
const rows = ref<EditablePublishLimitRule[]>([])

/* 个人用户规则页：仅个人用户（未实名/已实名）两个固定身份组；
 * 社区个体/社区企业的按等级额度与积分消费折扣在「等级规则」页维护（PublishingLimitRule 同一张表） */
const scopeOrder: PublishLimitScope[] = ['personal_unverified', 'personal_verified']
const scopeLabels: Record<'personal_unverified' | 'personal_verified', string> = {
  personal_unverified: '个人用户 · 未实名',
  personal_verified: '个人用户 · 已实名',
}
const limitKeys = ['demandPublishLimit', 'articleSubmitLimit', 'eventEnrollLimit', 'spaceReserveLimit'] as const
const columns = [
  /* 固定列不应可拖拽：固定列宽变化会与横向滚动的冻结计算冲突 */
  { colKey: 'scope', title: '身份组', cell: 'scope', width: 190, fixed: 'left', resizable: false },
  { colKey: 'level', title: '适用等级', cell: 'level', width: 130 },
  { colKey: 'demandPublishLimit', title: '需求发布 / 日', cell: 'demandPublishLimit', width: 160, align: 'right' as const },
  { colKey: 'articleSubmitLimit', title: '文章投稿 / 日', cell: 'articleSubmitLimit', width: 160, align: 'right' as const },
  { colKey: 'eventEnrollLimit', title: '活动报名 / 日', cell: 'eventEnrollLimit', width: 160, align: 'right' as const },
  { colKey: 'spaceReserveLimit', title: '空间预约 / 日', cell: 'spaceReserveLimit', width: 160, align: 'right' as const },
]

/* -1 / 0 不是普通数值：就地给出中文语义，避免与正整数次数混淆 */
function limitNote(value: number): string {
  if (value === -1) return '不限'
  if (value === 0) return '禁止'
  return ''
}
const sortedRows = computed(() => [...rows.value].sort((a, b) => scopeOrder.indexOf(a.scope) - scopeOrder.indexOf(b.scope)))

async function load() {
  loading.value = true
  try {
    rows.value = (await fetchPublishLimits()).map(row => ({
      ...row,
      key: `${row.scope}:${row.level ?? 'fixed'}`,
    }))
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

async function onSave() {
  const invalid = rows.value.some(row => limitKeys.some(key => !Number.isInteger(row[key]) || row[key] < -1))
  if (invalid) return void MessagePlugin.warning('限制次数只能填写 -1 或不小于 0 的整数')
  saving.value = true
  try {
    await savePublishLimits(rows.value.map(({ key: _key, ...row }) => row))
    MessagePlugin.success('个人用户规则已保存')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="publish-limits-panel page-fade-in">
    <PageHeader title="个人用户规则" description="个人用户（未实名 / 已实名）的每日业务操作额度；社区个体与社区企业的额度按等级在「等级规则」页配置" />
    <t-alert theme="info">
      <div class="rule-guide" role="note">
        <span><strong>-1</strong> 表示不限次数</span>
        <span><strong>0</strong> 表示禁止操作</span>
        <span>正整数表示每个自然日的可用次数</span>
      </div>
    </t-alert>
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <div class="page-card">
      <t-table row-key="key" table-layout="fixed" resizable :data="sortedRows" :columns="columns" :loading="loading" empty="暂无个人用户规则">
        <template #scope="{ row }">
          <div class="scope-name">{{ scopeLabels[row.scope as 'personal_unverified' | 'personal_verified'] }}</div>
        </template>
        <template #level="{ row }">
          <div v-if="row.level" class="level-cell"><span>{{ row.level }} 级</span><small>{{ row.levelLabel || '未命名' }}</small></div>
          <span v-else>固定身份组</span>
        </template>
        <template v-for="key in limitKeys" #[key]="{ row }" :key="key">
          <div class="limit-cell">
            <t-input-number
              v-model="row[key]"
              :min="-1"
              :max="10000"
              :decimal-places="0"
              theme="normal"
              align="right"
              class="limit-input"
            />
            <!-- 固定宽度的语义列：-1/0 就地可辨，且各行输入框等宽以保证数字右对齐 -->
            <span class="limit-note" :class="{ 'is-block': row[key] === 0 }">{{ limitNote(row[key]) }}</span>
          </div>
        </template>
      </t-table>
    </div>
    <div class="page-card save-card">
      <span class="save-tip">保存后新发生的需求发布、文章投稿、活动报名和空间预约立即按新额度校验。</span>
      <t-button theme="primary" :loading="saving" :disabled="loading || !rows.length" @click="onSave">保存规则</t-button>
    </div>
  </div>
</template>

<style scoped>
.rule-guide { display: flex; flex-wrap: wrap; gap: 8px 24px; color: var(--td-text-color-secondary); font-size: 12px; }
.rule-guide strong { color: var(--td-text-color-primary); }
.scope-name { color: var(--td-text-color-primary); font-weight: 500; }
.scope-note { margin-top: 2px; color: var(--td-text-color-secondary); font-size: 12px; }
.level-cell { display: flex; flex-direction: column; gap: 2px; color: var(--td-text-color-primary); }
.level-cell small { color: var(--td-text-color-secondary); font-size: 12px; }
/* 输入框占满可用宽度，尾部留固定宽度的语义列（不限/禁止），保证各行数字右对齐 */
.limit-cell { display: flex; align-items: center; gap: 8px; }
.limit-input { flex: 1; min-width: 0; }
.limit-note { flex: none; width: 24px; font-size: 12px; color: var(--td-text-color-secondary); }
.limit-note.is-block { color: var(--td-warning-color); }
.save-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.save-tip { color: var(--td-text-color-secondary); font-size: 12px; }
@media (max-width: 720px) { .save-card { align-items: stretch; flex-direction: column; } }
</style>
