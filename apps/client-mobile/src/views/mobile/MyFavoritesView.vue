<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Tag } from 'tdesign-mobile-vue'
import { listFavorites } from '@/api/favorites'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { FavoriteItem, FavoriteTargetType } from '@/types'

/* 我的收藏（v37 [MOCK-ONLY]；v40 扩展企业/人才并支持类型筛选）：点击回到原内容。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(listFavorites)
onMounted(run)

const activeType = ref<'all' | FavoriteTargetType>('all')
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

function go(item: FavoriteItem) {
  void router.push(`${TYPE_PATH[item.type]}${item.targetId}`)
}
</script>

<template>
  <div class="page-fade-in m-favorites">
    <h2 class="page-title">我的收藏</h2>

    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="all.length">
      <div class="chips">
        <Tag
          v-for="f in FILTERS"
          :key="f.value"
          :theme="activeType === f.value ? 'primary' : 'default'"
          variant="light"
          size="medium"
          @click="activeType = f.value"
        >
          {{ f.label }}
        </Tag>
      </div>
      <EmptyBlock v-if="!items.length" text="该类型下暂无收藏" />
      <div v-else class="stagger list">
        <p class="list-count">共 {{ items.length }} 条</p>
        <article v-for="item in items" :key="item.id" class="m-card fav-card" v-pressable @click="go(item)">
          <div class="fav-head">
            <Tag size="small" variant="light" theme="primary">{{ TYPE_LABEL[item.type] }}</Tag>
            <h3 class="fav-title">{{ item.title }}</h3>
          </div>
          <p v-if="item.subtitle" class="fav-sub">{{ item.subtitle }}</p>
          <p class="fav-at">收藏于 {{ item.at }}</p>
        </article>
      </div>
    </template>
    <EmptyBlock v-else text="暂无收藏，去项目、文章或活动页收藏感兴趣的内容" />
  </div>
</template>

<style scoped>
.m-favorites {
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

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fav-card {
  cursor: pointer;
}

.fav-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fav-title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  min-width: 0;
}

.fav-sub,
.fav-at {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.fav-at {
  color: var(--td-text-color-placeholder);
}
</style>
