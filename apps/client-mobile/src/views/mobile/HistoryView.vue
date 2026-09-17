<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, DialogPlugin, Toast } from 'tdesign-mobile-vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { clearReadingHistory, listReadingHistory, removeReadingHistoryItem } from '@/utils/readingHistory'

/* 浏览历史（v40，本机记录，最多 10 条）：点击回到文章，可单条移除或全部清空。 */
const router = useRouter()
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
      <h1 class="page-title">浏览历史</h1>
      <Button v-if="items.length" size="small" variant="outline" @click="onClear">清空</Button>
    </header>

    <EmptyBlock v-if="!items.length" text="暂无浏览记录，去社区内容逛逛" />
    <div v-else class="list">
      <article v-for="item in items" :key="item.id" class="m-card row" v-pressable @click="router.push(`/articles/${item.id}`)">
        <div class="main">
          <p class="title">{{ item.title }}</p>
          <p class="at">浏览于 {{ item.at }}</p>
        </div>
        <a class="remove" v-pressable @click.stop="onRemove(item.id)">移除</a>
      </article>
    </div>
  </div>
</template>

<style scoped>
.m-history {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  margin: 0;
  font-size: 18px;
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
  cursor: pointer;
}

.title {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
}

.at {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.remove {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  cursor: pointer;
}
</style>
