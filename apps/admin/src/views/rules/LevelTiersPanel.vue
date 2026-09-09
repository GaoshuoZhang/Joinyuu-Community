<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchLevelTiers, saveLevelTiers } from '@/api/rules'
import type { LevelTier } from '@/types'

/* 等级规则面板：设定等级梯度（最低 1 级、默认 5 级、最多 10 级），
 * 可编辑每级标签（青铜/白银/黄金/铂金/钻石…）与门槛经验值，整组保存（门槛须逐级递增） */
const MAX_LEVELS = 10

const loading = ref(false)
const saving = ref(false)
const tiers = reactive<{ rows: LevelTier[] }>({ rows: [] })

async function load() {
  loading.value = true
  try {
    tiers.rows = await fetchLevelTiers()
  } finally {
    loading.value = false
  }
}

function addLevel() {
  if (tiers.rows.length >= MAX_LEVELS) {
    MessagePlugin.warning(`等级最多 ${MAX_LEVELS} 级`)
    return
  }
  const last = tiers.rows[tiers.rows.length - 1]
  tiers.rows.push({
    level: tiers.rows.length + 1,
    label: '',
    threshold: last ? last.threshold + 100 : 0,
  })
}

function removeLevel(index: number) {
  tiers.rows.splice(index, 1)
}

async function onSave() {
  if (tiers.rows.length === 0) {
    MessagePlugin.warning('至少保留 1 个等级')
    return
  }
  const emptyLabel = tiers.rows.find((t) => !t.label.trim())
  if (emptyLabel) {
    MessagePlugin.warning('等级标签不能为空，请补全后保存')
    return
  }
  for (let i = 1; i < tiers.rows.length; i++) {
    if (tiers.rows[i].threshold <= tiers.rows[i - 1].threshold) {
      MessagePlugin.warning('门槛经验值必须逐级递增，请调整后保存')
      return
    }
  }
  saving.value = true
  try {
    await saveLevelTiers(tiers.rows.map((t, i) => ({ ...t, level: i + 1 })))
    MessagePlugin.success(`等级梯度已保存（共 ${tiers.rows.length} 级）`)
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
  <div class="level-rules-panel page-fade-in">
    <PageHeader title="等级规则" description="设定经验等级梯度：等级数、每级标签与门槛经验值" />

    <div class="page-filter-bar">
      <span class="panel-tip">
        门槛为累计经验值，须逐级递增；等级顺序按列表自动编排（1 起连续递增）；梯度变更仅影响后续结算，历史身份数据不迁移。
      </span>
      <t-button variant="outline" style="margin-left: auto">
        <template #icon><RefreshIcon /></template>
        刷新
      </t-button>
    </div>

    <div class="page-card">
      <t-loading :loading="loading" size="small">
        <div class="tier-head">
          <span class="tier-col-level">等级</span>
          <span class="tier-col-label">等级标签</span>
          <span class="tier-col-threshold">门槛经验值</span>
          <span class="tier-col-op"></span>
        </div>
        <div v-for="(tier, i) in tiers.rows" :key="i" class="tier-row">
          <span class="tier-col-level">
            <t-tag theme="primary" variant="light" size="small">{{ i + 1 }} 级</t-tag>
          </span>
          <span class="tier-col-label">
            <t-input v-model="tier.label" :maxlength="8" clearable placeholder="如 青铜" />
          </span>
          <span class="tier-col-threshold">
            <t-input-number
              v-model="tier.threshold"
              :min="i === 0 ? 0 : tiers.rows[i - 1].threshold + 1"
              theme="column"
              style="width: 100%"
            />
          </span>
          <span class="tier-col-op">
            <t-popconfirm
              v-if="tiers.rows.length > 1"
              :content="`确认删除等级「${tier.label || i + 1}」？`"
              @confirm="removeLevel(i)"
            >
              <t-button variant="text" size="small" theme="danger">
                <template #icon><DeleteIcon /></template>
              </t-button>
            </t-popconfirm>
          </span>
        </div>
        <div class="tier-actions">
          <t-button
            variant="dashed"
            :disabled="tiers.rows.length >= MAX_LEVELS"
            @click="addLevel"
          >
            <template #icon><AddIcon /></template>
            添加等级（{{ tiers.rows.length }}/{{ MAX_LEVELS }}）
          </t-button>
        </div>
      </t-loading>
    </div>

    <div class="page-card save-card">
      <span class="panel-tip">
        保存后梯度立即生效；历史身份的等级显示按新梯度由后端重算（原型阶段不迁移数据）。
      </span>
      <t-button theme="primary" :loading="saving" @click="onSave">保存梯度</t-button>
    </div>
  </div>
</template>

<style scoped>
.panel-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.tier-head,
.tier-row {
  display: grid;
  grid-template-columns: 90px 1fr 220px 90px;
  gap: 16px;
  align-items: center;
}

.tier-head {
  padding: 0 0 10px;
  border-bottom: 1px solid var(--td-component-border);
  font-size: 13px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.tier-row {
  padding: 10px 0;
  border-bottom: 1px dashed var(--td-component-border);
}

.tier-row:last-of-type {
  border-bottom: none;
}

.tier-col-op {
  text-align: center;
}

.tier-actions {
  padding-top: 16px;
}

.save-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
</style>
