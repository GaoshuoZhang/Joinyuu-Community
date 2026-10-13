<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import IndividualCardDialog from '@/components/IndividualCardDialog.vue'
import { fetchCard, type CardRow } from '@/api/cards'

const props = defineProps<{ uid: string }>()
const loading = ref(false)
const card = ref<CardRow | null>(null)
const editVisible = ref(false)

async function load() {
  loading.value = true
  try { card.value = await fetchCard('individual', props.uid) }
  catch (error) { MessagePlugin.error(error instanceof Error ? error.message : '名片加载失败') }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div class="user-card-tab">
    <t-loading :loading="loading">
      <t-descriptions v-if="card" :column="2" bordered>
        <t-descriptions-item label="展示姓名">{{ card.displayName }}</t-descriptions-item>
        <t-descriptions-item label="相关技能">{{ card.skills?.join('、') || '—' }}</t-descriptions-item>
        <t-descriptions-item label="个人简介" :span="2">{{ card.intro || '—' }}</t-descriptions-item>
        <t-descriptions-item label="行业经验" :span="2">{{ card.industryExperience || '—' }}</t-descriptions-item>
      </t-descriptions>
      <t-button class="card-edit" v-permission="'/users'" :disabled="!card" @click="editVisible = true">编辑名片</t-button>
    </t-loading>
    <!-- 编辑个体名片（原「名片管理」页的个人名片编辑，已并入本页） -->
    <IndividualCardDialog v-model:visible="editVisible" :uid="uid" :card="card" @success="load" />
  </div>
</template>

<style scoped>.user-card-tab { padding-top: 16px; }.card-edit { margin-top: 16px; }</style>
