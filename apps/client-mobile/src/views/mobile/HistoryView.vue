<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { clearReadingHistory, listReadingHistory, removeReadingHistoryItem } from '@/utils/readingHistory'
import { formatLocalDateTime } from '@/utils/format'

/* 浏览历史（v40，本机记录，最多 10 条）：点击回到文章，可单条移除或全部清空。
 * v45：空状态补出口——历史记录承载的是资讯，指向「广场 > 资讯」而不是泛泛的社区页。 */
const router = useRouter()
const items = ref(listReadingHistory())

function refresh() {
  items.value = listReadingHistory()
}

function onRemove(id: string) {
  /* v51：与同页「清空」口径一致——移除属破坏性操作，补二次确认，避免误触丢失该条记录 */
  confirmDialog({
    title: '移除该条记录',
    content: '确认从本机浏览历史中移除这条记录？',
    cancelBtn: '取消',
    confirmBtn: '移除',
    onConfirm: () => {
      removeReadingHistoryItem(id)
      refresh()
      Toast('已移除该条浏览记录')
    },
  })
}

function onClear() {
  confirmDialog({
    title: '清空浏览历史',
    content: '确认清空本机浏览历史？',
    cancelBtn: '取消',
    confirmBtn: '清空',
    onConfirm: () => {
      clearReadingHistory()
      refresh()
      Toast('浏览历史已清空')
    },
  })
}
</script>

<template>
  <div class="page-fade-in m-history">
    <header class="head">
      <Button v-if="items.length" size="small" variant="outline" @click="onClear">清空</Button>
    </header>

    <!-- v45：空状态补出口，避免二级页没有 TabBar 时成为死胡同 -->
    <EmptyBlock
      v-if="!items.length"
      text="暂无浏览记录，去社区内容逛逛"
      action-text="看资讯"
      @action="router.push('/plaza?tab=articles')"
    />
    <div v-else class="list stagger">
      <!-- v52：按压反馈（.pressable）挂在真链接上——卡片自身不承载点击语义，
           挂在不可点的 article 上会显示指针光标与按压缩放却无响应（虚假可点暗示，界面审查 LOW） -->
      <article v-for="item in items" :key="item.id" class="m-card row">
        <router-link class="main pressable" :to="`/articles/${item.id}`">
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
  font: var(--app-type-card-title);
}

.at {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.remove {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
  font: var(--app-type-body-sm);
}
</style>
