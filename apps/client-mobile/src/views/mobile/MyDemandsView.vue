<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchMyDemands, withdrawDemand } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { DEMAND_KIND_LABELS } from '@/constants/demand'
import type { DemandKind, MyDemandItem } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyDemands)

const items = computed(() => data.value ?? [])
const { visibleItems, hasMore, showMore } = useIncrementalList(items)
onMounted(run)

const REVISE_ROUTES: Record<DemandKind, string> = {
  task: '/demands/new/task',
  investment: '/demands/new/invest',
  cooperation: '/demands/new/cooperation',
}

function onRevise(d: MyDemandItem) {
  void router.push(`${REVISE_ROUTES[d.kind ?? 'task']}?revise=${d.id}`)
}

function onWithdrawDemand(d: MyDemandItem) {
  DialogPlugin.confirm({
    title: '撤回需求',
    content: `撤回后「${d.title}」将不再进入审核，可在列表中修改重提。`,
    cancelBtn: '取消',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      try {
        await withdrawDemand(d.id)
        Toast('已撤回需求')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      }
    },
  })
}

</script>

<template>
  <div class="m-my-demands page-fade-in">
    <Button theme="primary" block class="publish" @click="router.push('/demands/new')">发布需求</Button>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="items.length === 0">
      <EmptyBlock text="暂无需求，去发布第一条" />
    </template>
    <div v-else class="list stagger">
      <p class="list-count">共 {{ formatZhNumber(items.length) }} 条需求</p>
      <article v-for="d in visibleItems" :key="d.id" class="demand-row m-card">
        <router-link class="demand-main" :to="`/demands/${d.id}`">
          <div class="row-head">
            <h2 class="row-title">{{ d.title }}</h2>
            <StateTag kind="demand" :value="d.status" />
          </div>
          <div class="row-meta">
            <Tag v-if="d.kind" class="kind" size="small" variant="light" theme="default">{{ DEMAND_KIND_LABELS[d.kind] }}</Tag>
            <Tag class="cat" size="small" variant="light" theme="primary">{{ d.categoryLabel }}</Tag>
            <span>{{ formatZhNumber(d.responseCount) }} 人响应</span>
            <span class="row-more">查看详情<Icon aria-hidden="true" name="chevron-right" size="12px" /></span>
          </div>
          <p class="row-time">发布于 {{ formatLocalDateTime(d.createdAt) }}</p>
          <p v-if="d.rejectReason" class="reject">驳回原因：{{ d.rejectReason }}</p>
        </router-link>
        <div v-if="d.status === 'pending' || d.status === 'rejected' || d.status === 'withdrawn'" class="row-ops">
          <Button v-if="d.status === 'pending'" size="small" variant="outline" @click.stop="onWithdrawDemand(d)">撤回</Button>
          <Button v-if="d.status === 'rejected' || d.status === 'withdrawn'" size="small" theme="primary" variant="outline" @click.stop="onRevise(d)">修改重提</Button>
        </div>
      </article>
      <Button v-if="hasMore" block variant="outline" @click="showMore">加载更多（剩余 {{ formatZhNumber(items.length - visibleItems.length) }} 条）</Button>
    </div>
  </div>
</template>

<style scoped>
.m-my-demands {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.demand-main {
  display: block;
  color: inherit;
  text-decoration: none;
}

.row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap:var(--app-space-4);
}

.row-title {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.45;
}

.row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap:var(--app-space-5);
  margin-top:var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.cat,
.kind {
  flex-shrink: 0;
}

.row-time {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.reject {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.row-ops {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-4);
}

.row-more {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-1);
  margin-left:auto;
  color: var(--td-brand-color);
  cursor: pointer;
}

</style>
