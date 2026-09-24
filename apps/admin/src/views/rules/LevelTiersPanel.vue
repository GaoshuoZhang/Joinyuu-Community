<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useListQueryState } from '@/utils/listQuery'
import { fetchLevelTiers, saveLevelTiers } from '@/api/rules'
import type { LevelTier, LevelTierScope } from '@/types'

/* 等级规则页：等级梯度 + 该等级每日需求发布/文章投稿额度 + 积分消费折扣
 * （发布额度存 PublishingLimitRule，折扣存 LevelTier.pointsDiscount；随等级梯度同事务保存） */
const MAX_LEVELS = 10
const MAX_LIMIT = 10000
const activeScope = ref<LevelTierScope>('community_individual')
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const tiers = reactive<Record<LevelTierScope, LevelTier[]>>({
  community_individual: [],
  community_enterprise: [],
})

const scopeLabels: Record<LevelTierScope, string> = {
  community_individual: '社区个体',
  community_enterprise: '社区企业',
}

/* 已保存快照：判断当前选项卡是否有未保存编辑，切换身份前必须先确认 */
const savedSnapshots = reactive<Record<LevelTierScope, string>>({
  community_individual: '',
  community_enterprise: '',
})

const isDirty = computed(
  () =>
    !!savedSnapshots[activeScope.value] &&
    JSON.stringify(tiers[activeScope.value]) !== savedSnapshots[activeScope.value],
)

async function load(scope = activeScope.value) {
  loading.value = true
  try {
    const result = await fetchLevelTiers(scope)
    tiers[scope] = result.tiers
    savedSnapshots[scope] = JSON.stringify(result.tiers)
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

function confirmDiscardChanges(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (value: boolean) => {
      if (settled) return
      settled = true
      dialog.destroy()
      resolve(value)
    }
    const dialog = DialogPlugin.confirm({
      header: '切换前确认',
      body: `${scopeLabels[activeScope.value]}等级梯度有未保存的修改，切换身份后将丢失。`,
      confirmBtn: '放弃修改并切换',
      cancelBtn: '继续编辑',
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
      onClose: () => settle(false),
    })
  })
}

async function changeScope(value: string | number) {
  const next = value as LevelTierScope
  if (next === activeScope.value) return
  if (isDirty.value) {
    if (!(await confirmDiscardChanges())) return
    /* 放弃修改：先按快照回滚当前身份，再切换 */
    await load(activeScope.value)
  }
  activeScope.value = next
  if (!tiers[next].length) await load(next)
  syncQuery()
}

function addLevel() {
  const rows = tiers[activeScope.value]
  if (rows.length >= MAX_LEVELS) return void MessagePlugin.warning(`等级最多 ${MAX_LEVELS} 级`)
  const last = rows.at(-1)
  /* 新增等级默认：额度不限（-1）、折扣原价（10），与后端缺省口径一致 */
  rows.push({ level: rows.length + 1, label: '', threshold: last ? last.threshold + 100 : 0, demandPublishLimit: -1, articleSubmitLimit: -1, pointsDiscount: 10 })
}

function removeLevel(index: number) {
  tiers[activeScope.value].splice(index, 1)
}

/* 额度 -1/0 不是普通数值：就地给出中文语义，避免与正整数次数混淆 */
function limitNote(value: number): string {
  if (value === -1) return '不限'
  if (value === 0) return '禁止'
  return ''
}

/* 折扣文案：10 = 原价；支持一位小数（8.5 → 8.5 折）；空值/非法值一律按原价，避免出现「undefined 折」 */
function discountNote(value: number | undefined): string {
  const tenths = discountTenthsOf(value)
  return tenths === 100 ? '原价' : `${tenths / 10} 折`
}

/** 折扣 → 十分位整数（10 = 1 折 … 100 = 原价）；空值/非法/越界按原价（100） */
function discountTenthsOf(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 100
  const tenths = Math.round(value * 10)
  return tenths >= 10 && tenths <= 100 ? tenths : 100
}

/** 折扣归一：保留一位小数，缺省 10（原价）——输入框留空时按原价保存 */
function coerceDiscount(value: number | undefined): number {
  return discountTenthsOf(value) / 10
}

/** 折扣入参校验：1-10 且最多一位小数（8.5 = 85 折；空值不算非法，保存时按 10 归一） */
function isDiscountInput(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 10 - Math.round(value * 10)) < 1e-6 && value >= 1 && value <= 10
}

async function onSave() {
  const rows = tiers[activeScope.value]
  if (!rows.length) return void MessagePlugin.warning('至少保留 1 个等级')
  if (rows.some(tier => !tier.label.trim())) return void MessagePlugin.warning('等级标签不能为空，请补全后保存')
  if (rows.some((tier, index) => index > 0 && tier.threshold <= rows[index - 1].threshold)) {
    return void MessagePlugin.warning('门槛经验值必须逐级递增，请调整后保存')
  }
  if (rows.some(tier => ![tier.demandPublishLimit, tier.articleSubmitLimit].every(v => Number.isInteger(v) && v >= -1 && v <= MAX_LIMIT))) {
    return void MessagePlugin.warning('发布额度只能填写 -1 或 0 至 10000 的整数')
  }
  if (rows.some(tier => tier.pointsDiscount != null && !isDiscountInput(tier.pointsDiscount))) {
    return void MessagePlugin.warning('积分消费折扣只能填写 1-10（最多一位小数，10 = 原价）')
  }
  saving.value = true
  try {
    await saveLevelTiers(activeScope.value, rows.map((tier, index) => ({
      ...tier,
      level: index + 1,
      /* 空值/非法值按原价（10）保存，与服务端缺省口径一致 */
      pointsDiscount: coerceDiscount(tier.pointsDiscount),
    })))
    MessagePlugin.success(`${scopeLabels[activeScope.value]}等级梯度已保存`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/* 选项卡状态同步 URL（scope=community_enterprise）：刷新/回退不丢失当前身份 */
const { syncQuery } = useListQueryState({}, () => {
  if (!tiers[activeScope.value].length) void load()
}, { refs: { activeScope } })

onMounted(() => load())
</script>

<template>
  <div class="level-rules-panel page-fade-in">
    <PageHeader title="等级规则" description="分别设定社区个体与社区企业的经验值等级梯度、每日发布额度与积分消费折扣" />
    <div class="page-card">
      <t-tabs :value="activeScope" @change="changeScope">
        <t-tab-panel value="community_individual" label="社区个体" />
        <t-tab-panel value="community_enterprise" label="社区企业" />
      </t-tabs>
      <p class="panel-tip">门槛为当前身份累计经验值，须逐级递增；发布额度 <strong>-1</strong> 不限、<strong>0</strong> 禁止、正整数为每日次数；积分消费折扣 <strong>1</strong>=1 折、<strong>10</strong>=原价（默认，支持一位小数如 8.5 = 85 折），适用于商城兑换与空间预约扣分。</p>
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
      <t-loading :loading="loading" size="small">
        <template v-if="tiers[activeScope].length">
          <div class="tier-table" role="table" :aria-label="`${scopeLabels[activeScope]}等级梯度`">
            <div class="tier-head" role="row">
              <span role="columnheader">等级</span>
              <span role="columnheader">等级标签</span>
              <span role="columnheader">门槛经验值</span>
              <span role="columnheader">需求发布 / 日</span>
              <span role="columnheader">文章投稿 / 日</span>
              <span role="columnheader">积分消费折扣</span>
              <span aria-hidden="true"></span>
            </div>
            <div v-for="(tier, index) in tiers[activeScope]" :key="index" class="tier-row" role="row">
              <span class="tier-cell" role="cell">
                <t-tag theme="primary" variant="light" size="small">{{ index + 1 }} 级</t-tag>
              </span>
              <span class="tier-cell" role="cell" data-label="等级标签">
                <t-input v-model="tier.label" :maxlength="8" clearable placeholder="如 青铜…" :aria-label="`${index + 1} 级等级标签`" />
              </span>
              <span class="tier-cell" role="cell" data-label="门槛经验值">
                <t-input-number v-model="tier.threshold" :min="index === 0 ? 0 : tiers[activeScope][index - 1].threshold + 1" :decimal-places="0" theme="column" :aria-label="`${index + 1} 级门槛经验值`" />
              </span>
              <span class="tier-cell limit-cell" role="cell" data-label="需求发布 / 日">
                <t-input-number v-model="tier.demandPublishLimit" :min="-1" :max="MAX_LIMIT" :decimal-places="0" theme="normal" align="right" class="limit-input" :aria-label="`${index + 1} 级需求发布每日额度`" />
                <span class="limit-note" :class="{ 'is-block': tier.demandPublishLimit === 0 }">{{ limitNote(tier.demandPublishLimit) }}</span>
              </span>
              <span class="tier-cell limit-cell" role="cell" data-label="文章投稿 / 日">
                <t-input-number v-model="tier.articleSubmitLimit" :min="-1" :max="MAX_LIMIT" :decimal-places="0" theme="normal" align="right" class="limit-input" :aria-label="`${index + 1} 级文章投稿每日额度`" />
                <span class="limit-note" :class="{ 'is-block': tier.articleSubmitLimit === 0 }">{{ limitNote(tier.articleSubmitLimit) }}</span>
              </span>
              <span class="tier-cell limit-cell" role="cell" data-label="积分消费折扣">
                <!-- 折扣支持一位小数（8.5 = 85 折）；留空失焦后归一为 10（原价），避免保存出空值 -->
                <t-input-number
                  v-model="tier.pointsDiscount"
                  :min="1"
                  :max="10"
                  :step="0.1"
                  :decimal-places="1"
                  theme="normal"
                  align="right"
                  class="limit-input"
                  :aria-label="`${index + 1} 级积分消费折扣`"
                  @blur="tier.pointsDiscount = coerceDiscount(tier.pointsDiscount)"
                />
                <span class="limit-note discount-note">{{ discountNote(tier.pointsDiscount) }}</span>
              </span>
              <span class="tier-cell" role="cell">
                <!-- 删除中间等级会使其后等级序号整体前移，需在确认文案中说明 -->
                <t-popconfirm v-if="tiers[activeScope].length > 1" :content="`确认删除等级「${tier.label || index + 1}」？其后等级序号将依次前移。`" @confirm="removeLevel(index)">
                  <t-button variant="text" size="small" theme="danger" :aria-label="`删除 ${index + 1} 级`"><template #icon><DeleteIcon /></template></t-button>
                </t-popconfirm>
              </span>
            </div>
          </div>
        </template>
        <t-empty v-else description="暂无等级，点击下方新增" />
        <div class="tier-actions">
          <t-button variant="dashed" :disabled="tiers[activeScope].length >= MAX_LEVELS" @click="addLevel">
            <template #icon><AddIcon /></template>新增等级（{{ tiers[activeScope].length }}/{{ MAX_LEVELS }}）
          </t-button>
        </div>
      </t-loading>
    </div>
    <div class="page-card save-card">
      <span class="panel-tip">{{ isDirty ? '当前身份有未保存的修改，切换身份前请先保存。' : '保存后仅更新当前选项卡的等级梯度、发布额度与积分消费折扣。' }}</span>
      <t-button theme="primary" :loading="saving" @click="onSave">保存{{ scopeLabels[activeScope] }}配置</t-button>
    </div>
  </div>
</template>

<style scoped>
.panel-tip { margin: 16px 0; font-size: 12px; color: var(--td-text-color-secondary); }
/* 无表格组件可用时补 ARIA 表格语义（role=table/row/cell），屏幕阅读器可建立列关联 */
.tier-table { width: 100%; }
.tier-head, .tier-row { display: grid; grid-template-columns: 84px minmax(140px, 1fr) minmax(150px, 200px) 132px 132px 124px 48px; gap: 16px; align-items: center; }
.tier-head { padding-bottom: 10px; border-bottom: 1px solid var(--td-component-border); font-size: 12px; font-weight: 500; }
.tier-row { padding: 10px 0; border-bottom: 1px dashed var(--td-component-border); }
/* 依赖 TDesign 内部类 .t-input / .t-input-number：单元格包裹元素下让内部输入控件撑满（控件默认固定宽），无对应公开 API；升级 TDesign 时复核类名 */
.tier-cell { min-width: 0; }
.tier-cell :deep(.t-input), .tier-cell :deep(.t-input-number) { width: 100%; }
/* 额度/折扣单元格：输入框占满可用宽度，尾部留固定宽度的语义列（不限 / 禁止 / N 折），保证各行数字右对齐。
 * 宽度按最长文案取（折扣档「9.5 折」12px 约 42px）：32px 会让折扣档折成两行。 */
.tier-row .limit-cell { display: flex; align-items: center; gap: 8px; }
.limit-input { flex: 1; min-width: 0; }
.limit-note { flex: none; width: 44px; white-space: nowrap; font-size: 12px; color: var(--td-text-color-secondary); }
.limit-note.is-block { color: var(--td-warning-color); }
.tier-actions { padding-top: 16px; }
/* 保存区吸底：等级条目多时无需滚到页面底部也能触达保存按钮 */
.save-card {
  position: sticky;
  bottom: 16px;
  z-index: 5;
  box-shadow: var(--td-shadow-1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.save-card .panel-tip { margin: 0; }
@media (max-width: 1100px) {
  /* 窄屏表头隐藏，字段自带标签（data-label）替代表头 */
  .tier-head { display: none; }
  .tier-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; align-items: end; }
  .tier-row > .tier-cell[data-label]::before { display: block; margin-bottom: 4px; font-size: 12px; color: var(--td-text-color-secondary); content: attr(data-label); }
  .tier-row > .tier-cell:first-child { grid-column: 1 / -1; }
}
</style>
