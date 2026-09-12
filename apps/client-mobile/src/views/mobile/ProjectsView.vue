<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Search, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchDemands } from '@/api/demands'
import { useAuthStore } from '@/stores/auth'
import { useAsyncList } from '@/composables/useAsyncList'
import { useDict } from '@/composables/useDict'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { Demand } from '@/types'

/* 项目页（2026-09-13 重构，排版复用原需求页：搜索栏 + 标签 + 列表）。
 * 数据复用需求（demands），语境定为「项目」；详情仍走 /demands/:id。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { items: categories } = useDict('demand_category')

const PAGE_SIZE = 10
const page = ref(1)
const category = ref('')
const keyword = ref(String(route.query.keyword ?? ''))
const keywordInput = ref(keyword.value)
const items = ref<Demand[]>([])
const total = ref(0)

const { loading, error, run } = useAsyncList(async () => {
  const res = await fetchDemands({
    page: page.value,
    pageSize: PAGE_SIZE,
    category: category.value || undefined,
    keyword: keyword.value || undefined,
  })
  items.value = page.value === 1 ? res.list : items.value.concat(res.list)
  total.value = res.total
})

onMounted(run)

const hasMore = computed(() => items.value.length < total.value)
const firstLoading = computed(() => loading.value && items.value.length === 0)
const firstError = computed(() => error.value && items.value.length === 0)

function selectCategory(label: string) {
  category.value = category.value === label ? '' : label
  page.value = 1
  run()
}

/* 实时搜索：输入防抖 300ms 后自动检索（清空即恢复全量） */
let searchTimer: number | undefined
watch(keywordInput, () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    keyword.value = v.trim()
    page.value = 1
    run()
  }, 300)
})
onBeforeUnmount(() => window.clearTimeout(searchTimer))

async function loadMore() {
  if (loading.value) return
  const prev = page.value
  page.value = prev + 1
  await run()
  if (error.value) {
    page.value = prev
    Toast(error.value)
  }
}

function onPublish() {
  router.push(auth.isLogged ? '/demands/new' : '/login?redirect=/demands/new')
}
</script>

<template>
  <div class="projects page-fade-in">
    <div class="intro">
      <h1 class="title">项目</h1>
      <p class="desc">社区成员发布的协作需求，响应即可参与共建</p>
    </div>

    <Button theme="primary" block class="publish" @click="onPublish">发布需求</Button>

    <Search v-model="keywordInput" class="search" placeholder="搜索项目" />

    <div class="chips">
      <Tag :theme="category === '' ? 'primary' : 'default'" variant="light" size="medium" @click="selectCategory('')">
        全部
      </Tag>
      <Tag
        v-for="c in categories"
        :key="c.code"
        :theme="category === c.label ? 'primary' : 'default'"
        variant="light"
        size="medium"
        @click="selectCategory(c.label)"
      >
        {{ c.label }}
      </Tag>
    </div>

    <div v-if="firstLoading" class="hint">加载中…</div>
    <EmptyBlock v-else-if="firstError" :text="error" />
    <EmptyBlock v-else-if="items.length === 0" text="暂无项目，换个筛选条件试试" />
    <div v-else class="list stagger">
      <article v-for="d in items" :key="d.id" class="demand-item m-card" @click="router.push(`/demands/${d.id}`)">
        <div class="d-head">
          <span class="d-cat">{{ d.categoryLabel }}</span>
          <h3 class="d-title">{{ d.title }}</h3>
        </div>
        <div class="d-meta">
          <span class="d-pub">
            <IdentityTag :type="d.publisherIdentity" />
            <span class="d-pub-name">{{ d.publisherName }}</span>
          </span>
          <span>截止 {{ d.deadline }}</span>
        </div>
        <p class="d-resp">{{ d.responseCount }} 人响应</p>
      </article>
    </div>

    <Button v-if="hasMore && !firstLoading" theme="default" variant="outline" block class="more-btn" :loading="loading" @click="loadMore">
      加载更多
    </Button>
    <p v-if="items.length > 0 && !hasMore && !firstLoading" class="end-tip">已加载全部 {{ total }} 条</p>
  </div>
</template>

<style scoped>
.projects {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro .title {
  margin: 0 0 4px;
  font-size: 20px;
}

.intro .desc {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.search {
  margin-bottom: 2px;
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.hint {
  padding: 20px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  text-align: center;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.demand-item {
  cursor: pointer;
}

.d-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.d-cat {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}

.d-title {
  margin: 0;
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.d-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.d-pub {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.d-resp {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-brand-color);
  font-weight: 600;
}

.more-btn {
  margin-top: 4px;
}

.end-tip {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>