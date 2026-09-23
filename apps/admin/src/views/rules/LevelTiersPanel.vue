<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useListQueryState } from '@/utils/listQuery'
import { fetchLevelTiers, saveLevelTiers } from '@/api/rules'
import type { LevelTier, LevelTierScope } from '@/types'

const MAX_LEVELS = 10
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
  rows.push({ level: rows.length + 1, label: '', threshold: last ? last.threshold + 100 : 0 })
}

function removeLevel(index: number) {
  tiers[activeScope.value].splice(index, 1)
}

async function onSave() {
  const rows = tiers[activeScope.value]
  if (!rows.length) return void MessagePlugin.warning('至少保留 1 个等级')
  if (rows.some(tier => !tier.label.trim())) return void MessagePlugin.warning('等级标签不能为空，请补全后保存')
  if (rows.some((tier, index) => index > 0 && tier.threshold <= rows[index - 1].threshold)) {
    return void MessagePlugin.warning('门槛经验值必须逐级递增，请调整后保存')
  }
  saving.value = true
  try {
    await saveLevelTiers(activeScope.value, rows.map((tier, index) => ({ ...tier, level: index + 1 })))
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
    <PageHeader title="等级规则" description="分别设定社区个体与社区企业的经验值等级梯度" />
    <div class="page-card">
      <t-tabs :value="activeScope" @change="changeScope">
        <t-tab-panel value="community_individual" label="社区个体" />
        <t-tab-panel value="community_enterprise" label="社区企业" />
      </t-tabs>
      <p class="panel-tip">门槛为当前身份累计经验值，须逐级递增；两个身份体系独立计算，互不影响。</p>
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
      <t-loading :loading="loading" size="small">
        <template v-if="tiers[activeScope].length">
          <div class="tier-table" role="table" :aria-label="`${scopeLabels[activeScope]}等级梯度`">
            <div class="tier-head" role="row">
              <span role="columnheader">等级</span>
              <span role="columnheader">等级标签</span>
              <span role="columnheader">门槛经验值</span>
              <span aria-hidden="true"></span>
            </div>
            <div v-for="(tier, index) in tiers[activeScope]" :key="index" class="tier-row" role="row">
              <span class="tier-cell" role="cell">
                <t-tag theme="primary" variant="light" size="small">{{ index + 1 }} 级</t-tag>
              </span>
              <span class="tier-cell" role="cell">
                <t-input v-model="tier.label" :maxlength="8" clearable placeholder="如 青铜…" :aria-label="`${index + 1} 级等级标签`" />
              </span>
              <span class="tier-cell" role="cell">
                <t-input-number v-model="tier.threshold" :min="index === 0 ? 0 : tiers[activeScope][index - 1].threshold + 1" :decimal-places="0" theme="column" :aria-label="`${index + 1} 级门槛经验值`" />
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
      <span class="panel-tip">{{ isDirty ? '当前身份有未保存的修改，切换身份前请先保存。' : '保存后仅更新当前选项卡的等级梯度。' }}</span>
      <t-button theme="primary" :loading="saving" @click="onSave">保存{{ scopeLabels[activeScope] }}梯度</t-button>
    </div>
  </div>
</template>

<style scoped>
.panel-tip { margin: 16px 0; font-size: 12px; color: var(--td-text-color-secondary); }
/* 无表格组件可用时补 ARIA 表格语义（role=table/row/cell），屏幕阅读器可建立列关联 */
.tier-table { width: 100%; }
.tier-head, .tier-row { display: grid; grid-template-columns: 90px minmax(160px, 1fr) minmax(180px, 220px) 48px; gap: 16px; align-items: center; }
.tier-head { padding-bottom: 10px; border-bottom: 1px solid var(--td-component-border); font-size: 12px; font-weight: 500; }
.tier-row { padding: 10px 0; border-bottom: 1px dashed var(--td-component-border); }
/* 依赖 TDesign 内部类 .t-input / .t-input-number：单元格包裹元素下让内部输入控件撑满（控件默认固定宽），无对应公开 API；升级 TDesign 时复核类名 */
.tier-cell { min-width: 0; }
.tier-cell :deep(.t-input), .tier-cell :deep(.t-input-number) { width: 100%; }
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
@media (max-width: 720px) {
  .tier-head { display: none; }
  .tier-row { grid-template-columns: 72px minmax(0, 1fr) 40px; }
  /* 窄屏网格重排：把门槛经验值单元格放到第 2 列（t-input-number 已不再是网格项） */
  .tier-row > .tier-cell:nth-child(3) { grid-column: 2; }
}
</style>
