<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { fetchCard, type CardRow } from '@/api/cards'

const props = defineProps<{ uid: string }>()
const router = useRouter()
const loading = ref(false)
const card = ref<CardRow | null>(null)

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
      <t-button class="card-edit" v-permission="'/card-management'" @click="router.push('/card-management?type=individual&keyword=' + uid)">前往名片管理编辑</t-button>
    </t-loading>
  </div>
</template>

<style scoped>.user-card-tab { padding-top: 16px; }.card-edit { margin-top: 16px; }</style>
