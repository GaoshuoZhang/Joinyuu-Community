<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Button, DialogPlugin, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { cancelReservation, fetchMyReservations } from '@/api/spaces'
import StateTag from '@/components/shared/StateTag.vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { SpaceReservation } from '@/types'

/* 移动我的预约：预约卡片；pending/approved 可取消（Dialog 二次确认）+ Toast + 列表刷新 */
const { data, loading, error, run } = useAsyncList(fetchMyReservations)
onMounted(run)

const actingId = ref('')

function canCancel(r: SpaceReservation) {
  return r.status === 'pending' || r.status === 'approved'
}

function onCancelTap(r: SpaceReservation) {
  DialogPlugin.confirm({
    title: '取消预约',
    content: `确认取消「${r.spaceName}」${r.date} ${r.start}-${r.end} 的预约？`,
    cancelBtn: '保留预约',
    confirmBtn: '确认取消',
    onConfirm: () => {
      void doCancel(r)
    },
  })
}

async function doCancel(r: SpaceReservation) {
  actingId.value = r.id
  try {
    await cancelReservation(r.id)
    Toast('已取消预约')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '取消失败，请稍后重试')
  } finally {
    actingId.value = ''
  }
}
</script>

<template>
  <div class="page-fade-in my-reservations">
    <h2 class="page-title">我的预约</h2>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data?.length" text="暂无预约记录" />
    <div v-else class="stagger list">
      <p class="list-count">共 {{ (data ?? []).length }} 条</p>
      <article v-for="r in data" :key="r.id" class="m-card">
        <div class="row">
          <h3 class="name">{{ r.spaceName }}</h3>
          <StateTag kind="reservation" :value="r.status" />
        </div>
        <p v-if="r.identityType" class="subject">
          <IdentityTag :type="r.identityType" />
          <span class="subject-name">{{ r.subjectName }}</span>
        </p>
        <p class="meta">📅 {{ r.date }} · {{ r.start }} - {{ r.end }} · 提交于 {{ r.createdAt }}</p>
        <p v-if="r.rejectReason" class="reject-reason">驳回原因：{{ r.rejectReason }}</p>
        <div v-if="canCancel(r)" class="ops">
          <Button theme="danger" variant="outline" size="small" :disabled="actingId === r.id" @click="onCancelTap(r)">
            {{ actingId === r.id ? '处理中…' : '取消预约' }}
          </Button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.my-reservations {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.page-title {
  margin: 0;
  padding: 0 2px;
  font-size: 18px;
}

.state {
  padding: 20px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.name {
  margin: 0;
  font-size: 14px;
  min-width: 0;
}

.meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.reject-reason {
  margin: 8px 0 0;
  color: var(--td-error-color);
  font-size: 12px;
}

.subject {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  font-size: 12px;
}

.subject-name {
  color: var(--td-text-color-secondary);
}

.ops {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>
