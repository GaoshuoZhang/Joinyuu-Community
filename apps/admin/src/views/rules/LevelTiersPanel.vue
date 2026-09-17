<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
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

async function load(scope = activeScope.value) {
  loading.value = true
  try {
    const result = await fetchLevelTiers(scope)
    tiers[scope] = result.tiers
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

async function changeScope(value: string | number) {
  activeScope.value = value as LevelTierScope
  if (!tiers[activeScope.value].length) await load()
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
        <div class="tier-head">
          <span>等级</span><span>等级标签</span><span>门槛经验值</span><span aria-hidden="true"></span>
        </div>
        <div v-for="(tier, index) in tiers[activeScope]" :key="index" class="tier-row">
          <span><t-tag theme="primary" variant="light" size="small">{{ index + 1 }} 级</t-tag></span>
          <t-input v-model="tier.label" :maxlength="8" clearable placeholder="如 青铜…" />
          <t-input-number v-model="tier.threshold" :min="index === 0 ? 0 : tiers[activeScope][index - 1].threshold + 1" :decimal-places="0" theme="column" />
          <t-popconfirm v-if="tiers[activeScope].length > 1" :content="`确认删除等级「${tier.label || index + 1}」？`" @confirm="removeLevel(index)">
            <t-button variant="text" size="small" theme="danger" :aria-label="`删除 ${index + 1} 级`"><template #icon><DeleteIcon /></template></t-button>
          </t-popconfirm>
        </div>
        <div class="tier-actions">
          <t-button variant="dashed" :disabled="tiers[activeScope].length >= MAX_LEVELS" @click="addLevel">
            <template #icon><AddIcon /></template>新增等级（{{ tiers[activeScope].length }}/{{ MAX_LEVELS }}）
          </t-button>
        </div>
      </t-loading>
    </div>
    <div class="page-card save-card">
      <span class="panel-tip">保存后仅更新当前选项卡的等级梯度。</span>
      <t-button theme="primary" :loading="saving" @click="onSave">保存{{ scopeLabels[activeScope] }}梯度</t-button>
    </div>
  </div>
</template>

<style scoped>
.panel-tip { margin: 16px 0; font-size: 12px; color: var(--td-text-color-secondary); }
.tier-head, .tier-row { display: grid; grid-template-columns: 90px minmax(160px, 1fr) minmax(180px, 220px) 48px; gap: 16px; align-items: center; }
.tier-head { padding-bottom: 10px; border-bottom: 1px solid var(--td-component-border); font-size: 13px; font-weight: 500; }
.tier-row { padding: 10px 0; border-bottom: 1px dashed var(--td-component-border); }
.tier-actions { padding-top: 16px; }
.save-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.save-card .panel-tip { margin: 0; }
@media (max-width: 720px) {
  .tier-head { display: none; }
  .tier-row { grid-template-columns: 72px minmax(0, 1fr) 40px; }
  .tier-row :deep(.t-input-number) { grid-column: 2; }
}
</style>
