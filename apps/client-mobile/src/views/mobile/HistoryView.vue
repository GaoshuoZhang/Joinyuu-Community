<script setup lang="ts">
import { ref } from 'vue'
import { Button, DialogPlugin, Toast } from 'tdesign-mobile-vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { clearReadingHistory, listReadingHistory, removeReadingHistoryItem } from '@/utils/readingHistory'
import { formatLocalDateTime } from '@/utils/format'

/* 浏览历史（v40，本机记录，最多 10 条）：点击回到文章，可单条移除或全部清空。 */
const items = ref(listReadingHistory())

function refresh() {
  items.value = listReadingHistory()
}

function onRemove(id: string) {
  removeReadingHistoryItem(id)
  refresh()
  Toast('已移除')
}

function onClear() {
  DialogPlugin.confirm({
    title: '清空浏览历史',
    content: '确认清空本机浏览历史？',
    cancelBtn: '取消',
    confirmBtn: '清空',
    onConfirm: () => {
      clearReadingHistory()
      refresh()
      Toast('已清空')
    },
  })
}
</script>

<template>
  <div class="page-fade-in m-history">
    <header class="head">
      <Button v-if="items.length" size="small" variant="outline" @click="onClear">清空</Button>
    </header>

    <EmptyBlock v-if="!items.length" text="暂无浏览记录，去社区内容逛逛" />
    <div v-else class="list">
      <article v-for="item in items" :key="item.id" class="m-card row">
        <router-link class="main" :to="`/articles/${item.id}`">
          <p class="title">{{ item.title }}</p>
          <p class="at">浏览于 {{ formatLocalDateTime(item.at) }}</p>
        </router-link>
        <Button class="remove" size="small" variant="text" theme="default" @click="onRemove(item.id)">移除</Button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-history {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
}

.main {
  flex: 1;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.title {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.45;
}

.at {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.remove {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
  font-size: var(--app-font-caption);
}
</style>
