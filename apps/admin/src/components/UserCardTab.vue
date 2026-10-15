<script setup lang="ts">
import { onMounted, ref } from 'vue'
import IndividualCardDialog from '@/components/IndividualCardDialog.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { cardFields, cardSegmentFields, fetchCard, type CardRow } from '@/api/cards'

const props = defineProps<{ uid: string }>()
const loading = ref(false)
const card = ref<CardRow | null>(null)
/* 加载失败就地展示并可重试：一次性 toast 数秒即逝，失败后界面将不可恢复（H-02） */
const loadError = ref('')
const editVisible = ref(false)
const segments = cardFields.individual.filter((field) => cardSegmentFields[field.key])
function segmentRows(key: string): Record<string, string>[] {
  return (card.value?.[key as keyof CardRow] ?? []) as Record<string, string>[]
}

async function load() {
  loading.value = true
  loadError.value = ''
  try { card.value = await fetchCard('individual', props.uid) }
  catch (error) {
    card.value = null
    loadError.value = error instanceof Error ? error.message : '名片加载失败，请重试'
  }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div class="user-card-tab">
    <t-loading :loading="loading">
      <ListErrorState v-if="loadError && !card" :message="loadError" :loading="loading" @retry="load" />
      <t-descriptions v-if="card" :column="2" bordered>
        <t-descriptions-item label="展示姓名">{{ card.displayName }}</t-descriptions-item>
        <t-descriptions-item label="相关技能">{{ card.skills?.join('、') || '—' }}</t-descriptions-item>
        <t-descriptions-item label="个人简介" :span="2">{{ card.intro || '—' }}</t-descriptions-item>
        <t-descriptions-item label="行业经验" :span="2">{{ card.industryExperience || '—' }}</t-descriptions-item>
        <t-descriptions-item label="年龄">{{ card.age ?? '—' }}（{{ card.visibility?.age === false ? '不公开' : '公开' }}）</t-descriptions-item>
        <t-descriptions-item label="政治面貌">{{ card.politicalStatus || '—' }}（{{ card.visibility?.politicalStatus === false ? '不公开' : '公开' }}）</t-descriptions-item>
      </t-descriptions>
      <t-collapse v-if="card" class="card-segments" :expand-on-row-click="true">
        <t-collapse-panel v-for="segment in segments" :key="segment.key" :value="segment.key" :header="`${segment.label}（${segmentRows(segment.key).length}）`">
          <t-empty v-if="!segmentRows(segment.key).length" :description="`暂无${segment.label}`" />
          <t-descriptions v-for="(row, index) in segmentRows(segment.key)" :key="index" :column="2" bordered class="segment-row">
            <t-descriptions-item v-for="field in cardSegmentFields[segment.key]" :key="field.key" :label="field.label">{{ row[field.key] || '—' }}</t-descriptions-item>
          </t-descriptions>
        </t-collapse-panel>
      </t-collapse>
      <t-button class="card-edit" v-permission="'/users'" :disabled="!card" @click="editVisible = true">编辑名片</t-button>
    </t-loading>
    <!-- 编辑个体名片（原「名片管理」页的个人名片编辑，已并入本页） -->
    <IndividualCardDialog v-model:visible="editVisible" :uid="uid" :card="card" @success="load" />
  </div>
</template>

<style scoped>
.user-card-tab { padding-top: 16px; }
.card-edit, .card-segments { margin-top: 16px; }
.segment-row + .segment-row { margin-top: 12px; }
.segment-row { overflow-wrap: anywhere; }
</style>
