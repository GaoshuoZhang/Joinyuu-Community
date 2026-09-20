<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import { Button, CheckTag, Tag } from 'tdesign-mobile-vue'
import { listFavorites } from '@/api/favorites'
import { useAsyncList } from '@/composables/useAsyncList'
import { useIncrementalList } from '@/composables/useIncrementalList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { FavoriteTargetType } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 我的收藏：支持需求、文章、活动、企业和人才筛选，点击回到原内容。 */
const route = useRoute()
const router = useRouter()
const { data, loading, error, run } = useAsyncList(listFavorites)
onMounted(run)

const FAVORITE_TYPES: FavoriteTargetType[] = ['demand', 'article', 'event', 'enterprise', 'talent']
function normalizeType(value: unknown): 'all' | FavoriteTargetType {
  return FAVORITE_TYPES.includes(String(value) as FavoriteTargetType) ? (String(value) as FavoriteTargetType) : 'all'
}
const activeType = ref<'all' | FavoriteTargetType>(normalizeType(route.query.type))
const TYPE_LABEL: Record<FavoriteTargetType, string> = { demand: '项目', article: '文章', event: '活动', enterprise: '企业', talent: '人才' }
const TYPE_PATH: Record<FavoriteTargetType, string> = {
  demand: '/demands/', article: '/articles/', event: '/events/', enterprise: '/enterprises/', talent: '/talents/',
}
const FILTERS: { value: 'all' | FavoriteTargetType; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'demand', label: '项目' },
  { value: 'article', label: '文章' },
  { value: 'event', label: '活动' },
  { value: 'enterprise', label: '企业' },
  { value: 'talent', label: '人才' },
]

const all = computed(() => data.value ?? [])
const items = computed(() => (activeType.value === 'all' ? all.value : all.value.filter((item) => item.type === activeType.value)))
const { visibleItems, hasMore, showMore } = useIncrementalList(items)

/* 类型筛选同步 URL，便于分享/返回还原 */
function pickType(value: 'all' | FavoriteTargetType) {
  activeType.value = value
  void router.replace({ query: value === 'all' ? {} : { type: value } })
}

useRouteQuerySync('/me/favorites', (query) => {
  activeType.value = normalizeType(query.type)
})
</script>

<template>
  <div class="page-fade-in m-favorites">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="all.length">
      <div class="chips">
        <CheckTag
          v-for="f in FILTERS"
          :key="f.value"
          variant="light"
          size="medium"
          :checked="activeType === f.value"
          @change="pickType(f.value)"
        >
          {{ f.label }}
        </CheckTag>
      </div>
      <EmptyBlock v-if="!items.length" text="该类型下暂无收藏" action-text="查看全部收藏" @action="pickType('all')" />
      <div v-else class="stagger list">
        <p class="list-count">共 {{ formatZhNumber(items.length) }} 条</p>
        <router-link v-for="item in visibleItems" :key="item.id" class="m-card fav-card pressable" :to="`${TYPE_PATH[item.type]}${item.targetId}`">
          <div class="fav-head">
            <Tag size="small" variant="light" theme="primary">{{ TYPE_LABEL[item.type] }}</Tag>
            <h2 class="fav-title">{{ item.title }}</h2>
          </div>
          <p v-if="item.subtitle" class="fav-sub">{{ item.subtitle }}</p>
          <p class="fav-at">收藏于 {{ formatLocalDateTime(item.at) }}</p>
        </router-link>
        <Button v-if="hasMore" block variant="outline" @click="showMore">
          加载更多（剩余 {{ formatZhNumber(items.length - visibleItems.length) }} 条）
        </Button>
      </div>
    </template>
    <EmptyBlock v-else text="暂无收藏，去项目、文章或活动页收藏感兴趣的内容" />
  </div>
</template>

<style scoped>
.m-favorites {
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.fav-card {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.fav-head {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
}

.fav-title {
  flex: 1;
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.45;
  min-width: 0;
}

.fav-sub,
.fav-at {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.fav-at {
  color: var(--td-text-color-placeholder);
}
</style>
