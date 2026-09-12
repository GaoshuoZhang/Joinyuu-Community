<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Tabs, TabPanel, Loading, Tag } from 'tdesign-mobile-vue'
import { fetchEvents } from '@/api/events'
import { fetchArticles, fetchColumns } from '@/api/contents'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityEvent, Article, ArticleColumn } from '@/types'

/* 广场页：顶部「活动 / 资讯」两个选项卡。活动展示进行中/已发布；资讯按栏目分类展示已发布文章。 */
const router = useRouter()

const activeTab = ref('events')

const { data: events, loading: eventsLoading, error: eventsError, run: loadEvents } = useAsyncList<CommunityEvent[]>(
  () => fetchEvents(),
)
const { data: columnData, run: loadColumns } = useAsyncList<ArticleColumn[]>(fetchColumns)
const activeColumn = ref('')
const { data: articleData, loading: articlesLoading, error: articlesError, run: loadArticles } = useAsyncList<Article[]>(() =>
  fetchArticles({ column: activeColumn.value || undefined }),
)

const columns = computed(() => columnData.value ?? [])
const articles = computed(() => articleData.value ?? [])
const eventsEmpty = computed(() => !eventsLoading.value && !eventsError.value && (events.value ?? []).length === 0)
const articlesEmpty = computed(() => !articlesLoading.value && !articlesError.value && articles.value.length === 0)

onMounted(() => {
  loadEvents()
  loadColumns()
  loadArticles()
})

function pickColumn(label: string) {
  activeColumn.value = label
  loadArticles()
}
</script>

<template>
  <div class="page-fade-in m-plaza">
    <Tabs v-model="activeTab" class="top-tabs">
      <TabPanel value="events" label="活动">
        <Loading v-if="eventsLoading" class="state" text="加载中…" />
        <EmptyBlock v-else-if="eventsError" :text="eventsError" />
        <EmptyBlock v-else-if="eventsEmpty" text="暂无进行中的活动" />
        <div v-else class="stagger list">
          <article
            v-for="ev in events"
            :key="ev.id"
            class="item m-card"
            @click="router.push(`/events/${ev.id}`)"
          >
            <div class="row-head">
              <span class="type-tag">{{ ev.typeLabel }}</span>
              <span class="capacity">已报名 {{ ev.approvedCount }}/{{ ev.capacity }}</span>
            </div>
            <h3 class="title">{{ ev.title }}</h3>
            <p class="meta">🕐 {{ ev.startTime }} · 📍 {{ ev.location }}</p>
          </article>
        </div>
      </TabPanel>

      <TabPanel value="articles" label="资讯">
        <div class="chips">
          <Tag
            class="chip"
            size="medium"
            :theme="activeColumn === '' ? 'primary' : 'default'"
            variant="light"
            @click="pickColumn('')"
          >
            全部
          </Tag>
          <Tag
            v-for="c in columns"
            :key="c.code"
            class="chip"
            size="medium"
            :theme="activeColumn === c.label ? 'primary' : 'default'"
            variant="light"
            @click="pickColumn(c.label)"
          >
            {{ c.label }}
          </Tag>
        </div>

        <Loading v-if="articlesLoading" class="state" text="加载中…" />
        <EmptyBlock v-else-if="articlesError" :text="articlesError" />
        <EmptyBlock v-else-if="articlesEmpty" text="暂无相关资讯" />
        <div v-else class="stagger list">
          <article
            v-for="a in articles"
            :key="a.id"
            class="item m-card"
            @click="router.push(`/articles/${a.id}`)"
          >
            <span class="col-tag">{{ a.columnLabel }}</span>
            <p class="title">{{ a.title }}</p>
            <p class="summary">{{ a.summary }}</p>
            <p class="meta">{{ a.authorName }} · {{ a.publishedAt }} · {{ a.views }} 次浏览</p>
          </article>
        </div>
      </TabPanel>
    </Tabs>
  </div>
</template>

<style scoped>
.m-plaza {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.top-tabs {
  --td-tabs-track-color: var(--td-brand-color);
}

.state {
  padding: 20px 0;
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 12px;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  cursor: pointer;
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.type-tag,
.col-tag {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.capacity {
  font-size: 11px;
  color: var(--td-brand-color);
}

.title {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.4;
}

.summary {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  margin: 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>