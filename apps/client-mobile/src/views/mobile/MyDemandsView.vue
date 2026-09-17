<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchMyDemands, withdrawDemand, appealDemand } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import ReasonSheet from '@/components/ReasonSheet.vue'
import { DEMAND_KIND_LABELS } from '@/constants/demand'
import type { DemandKind, MyDemandItem } from '@/types'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyDemands)

const items = computed(() => data.value ?? [])

/** 条目点击进入需求详情（响应情况与承接方选择均在详情页查看/操作） */
function openDemand(d: MyDemandItem) {
  void router.push(`/demands/${d.id}`)
}

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

/* v35 驳回申诉 */
const appealVisible = ref(false)
const appealTarget = ref<MyDemandItem | null>(null)

function onAppeal(d: MyDemandItem) {
  appealTarget.value = d
  appealVisible.value = true
}

async function submitAppeal(text: string) {
  const target = appealTarget.value
  if (!target) return
  if (!text) {
    Toast('请填写申诉理由')
    return
  }
  try {
    await appealDemand(target.id, text)
    Toast('申诉已提交，运营将复核')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '申诉提交失败，请稍后重试')
  }
}

</script>

<template>
  <div class="m-my-demands page-fade-in">
    <Button theme="primary" block class="publish" @click="router.push('/demands/new')">发布需求</Button>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="items.length === 0">
      <EmptyBlock text="暂无需求，去发布第一条" />
      <Button theme="primary" block @click="router.push('/demands/new')">发布需求</Button>
    </template>
    <div v-else class="list stagger">
      <p class="list-count">共 {{ items.length }} 条需求</p>
      <article v-for="d in items" :key="d.id" v-pressable class="demand-row m-card" role="button" tabindex="0" @click="openDemand(d)" @keydown.enter="openDemand(d)">
        <div class="row-head">
          <h3 class="row-title">{{ d.title }}</h3>
          <StateTag kind="demand" :value="d.status" />
        </div>
        <div class="row-meta">
          <Tag v-if="d.kind" class="kind" size="small" variant="light" theme="default">{{ DEMAND_KIND_LABELS[d.kind] }}</Tag>
          <Tag class="cat" size="small" variant="light" theme="primary">{{ d.categoryLabel }}</Tag>
          <span>{{ d.responseCount }} 人响应</span>
          <span class="row-more">查看详情<Icon name="chevron-right" size="12px" /></span>
        </div>
        <p class="row-time">发布于 {{ d.createdAt }}</p>
        <p v-if="d.rejectReason" class="reject">驳回原因：{{ d.rejectReason }}</p>
        <p v-if="d.status === 'rejected' && d.appealed" class="appealed">已提交申诉{{ d.appealReason ? `：${d.appealReason}` : '' }}</p>
        <div v-if="d.status === 'pending' || d.status === 'rejected' || d.status === 'withdrawn'" class="row-ops">
          <Button v-if="d.status === 'pending'" size="small" variant="outline" @click.stop="onWithdrawDemand(d)">撤回</Button>
          <Button v-if="d.status === 'rejected' && !d.appealed" size="small" variant="outline" @click.stop="onAppeal(d)">申诉</Button>
          <Button v-if="d.status === 'rejected' || d.status === 'withdrawn'" size="small" theme="primary" variant="outline" @click.stop="onRevise(d)">修改重提</Button>
        </div>
      </article>
    </div>

    <ReasonSheet v-model:visible="appealVisible" title="需求申诉" placeholder="请说明申诉理由（如已按要求补充材料、驳回原因与事实不符等）…" :maxlength="300" submit-label="提交申诉" @submit="submitAppeal" />
  </div>
</template>

<style scoped>
.m-my-demands {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.row-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
}

.row-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cat,
.kind {
  flex-shrink: 0;
}

.row-time {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.reject {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.row-ops {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.appealed {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-warning-color);
}

.row-more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  color: var(--td-brand-color);
  cursor: pointer;
}

.demand-row {
  cursor: pointer;
}
</style>
