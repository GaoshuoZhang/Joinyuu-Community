<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Toast } from 'tdesign-mobile-vue'
import { fetchMyResponses, withdrawDemandResponse } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyResponseItem } from '@/types'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyResponses)

onMounted(run)

const items = computed(() => data.value ?? [])

function onWithdraw(item: MyResponseItem) {
  DialogPlugin.confirm({
    title: '撤回响应',
    content: `撤回后「${item.demandTitle}」的响应将被移除，你可以重新响应。`,
    cancelBtn: '取消',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      try {
        await withdrawDemandResponse(item.id)
        Toast('已撤回响应')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      }
    },
  })
}
</script>

<template>
  <div class="m-my-responses page-fade-in">
    <h1 class="title">我的响应</h1>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="items.length === 0" text="暂无响应记录" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ items.length }} 条</p>
      <article v-for="r in items" :key="r.id" class="resp-row m-card" v-pressable @click="router.push(`/demands/${r.demandId}`)">
        <p class="row-title">{{ r.demandTitle }}</p>
        <p class="row-note">{{ r.note }}</p>
        <p v-if="r.status" class="row-status">
          <StateTag kind="demand" :value="r.status === 'accepted' ? 'projected' : (r.status ?? 'pending')" />
          <span v-if="r.rejectReason">{{ r.rejectReason }}</span>
        </p>
        <a class="chat-link" v-pressable @click.stop="router.push(`/demands/${r.demandId}/messages`)">沟通<Icon name="chevron-right" size="12px" /></a>
        <div v-if="(r.status ?? 'pending') === 'pending'" class="row-actions">
          <Button size="small" variant="outline" @click.stop="onWithdraw(r)">撤回响应</Button>
        </div>
        <p class="row-at">响应于 {{ r.at }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-my-responses {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 18px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chat-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 6px;
  min-height: 32px;
  font-size: 13px;
  color: var(--td-brand-color);
}

.resp-row {
  cursor: pointer;
}

.row-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
}

.row-note {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.row-at {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.row-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.row-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
</style>
