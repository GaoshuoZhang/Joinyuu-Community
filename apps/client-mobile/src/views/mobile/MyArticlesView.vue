<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchMyArticles, withdrawArticle, appealArticle } from '@/api/contents'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import ReasonSheet from '@/components/ReasonSheet.vue'
import type { MySubmittedArticle } from '@/types'

/* 移动我的投稿：状态标签 + 驳回原因；审核中可撤回，驳回/撤回后可修改重提；空态引导去投稿 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList<MySubmittedArticle[]>(fetchMyArticles)

const items = computed(() => data.value ?? [])
const empty = computed(() => !loading.value && !error.value && items.value.length === 0)

function onRevise(a: MySubmittedArticle) {
  void router.push(`/articles/new?revise=${a.id}`)
}

function onWithdraw(a: MySubmittedArticle) {
  DialogPlugin.confirm({
    title: '撤回投稿',
    content: `撤回后「${a.title}」将不再进入审核，可在列表中修改重提。`,
    cancelBtn: '取消',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      try {
        await withdrawArticle(a.id)
        Toast('已撤回投稿')
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '撤回失败，请稍后重试')
      }
    },
  })
}

/* v35 驳回申诉 */
const appealVisible = ref(false)
const appealTarget = ref<MySubmittedArticle | null>(null)

function onAppeal(a: MySubmittedArticle) {
  appealTarget.value = a
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
    await appealArticle(target.id, text)
    Toast('申诉已提交，运营将复核')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '申诉提交失败，请稍后重试')
  }
}

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-my-articles">
    <header class="page-header head">
      <h2 class="page-title">我的投稿</h2>
      <div v-if="!empty" class="page-header-actions">
        <Button theme="primary" size="small" @click="router.push('/articles/new')">去投稿</Button>
      </div>
    </header>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="empty">
      <EmptyBlock text="还没有投稿，去写一篇吧" />
      <Button theme="primary" block @click="router.push('/articles/new')">去投稿</Button>
    </template>
    <div v-else class="stagger list">
      <p class="list-count">共 {{ items.length }} 篇</p>
      <section v-for="a in items" :key="a.id" class="m-card item">
        <header class="row">
          <h3 class="title">{{ a.title }}</h3>
          <StateTag kind="article" :value="a.status" />
        </header>
        <p class="meta">{{ a.columnLabel }} · 提交于 {{ a.submittedAt }}</p>
        <p v-if="a.status === 'rejected'" class="reject">驳回原因：{{ a.rejectReason ?? '未填写' }}</p>
        <p v-if="a.status === 'rejected' && a.appealed" class="appealed">已提交申诉{{ a.appealReason ? `：${a.appealReason}` : '' }}</p>
        <div v-if="a.status === 'pending' || a.status === 'rejected' || a.status === 'withdrawn'" class="ops">
          <Button v-if="a.status === 'pending'" size="small" variant="outline" @click="onWithdraw(a)">撤回</Button>
          <Button v-if="a.status === 'rejected' && !a.appealed" size="small" variant="outline" @click="onAppeal(a)">申诉</Button>
          <Button
            v-if="a.status === 'rejected' || a.status === 'withdrawn'"
            size="small"
            theme="primary"
            variant="outline"
            @click="onRevise(a)"
          >
            修改重提
          </Button>
        </div>
      </section>
    </div>

    <ReasonSheet v-model:visible="appealVisible" title="投稿申诉" placeholder="请说明申诉理由…" :maxlength="300" submit-label="提交申诉" @submit="submitAppeal" />
  </div>
</template>

<style scoped>
.m-my-articles {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head .page-title {
  margin: 0;
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
  align-items: flex-start;
  gap: 10px;
}

.title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
}

.meta {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.reject {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.hint {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.ops {
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
</style>
