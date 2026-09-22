<script setup lang="ts">
import { ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import ListEmptyState from '@/components/ListEmptyState.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { fetchArticleComments, removeArticleComment, type ArticleCommentItem } from '@/api/contents'

const emit = defineEmits<{ (e: 'success'): void }>()
const visible = ref(false)
const loading = ref(false)
const loadError = ref('')
const removing = ref('')
const reason = ref('')
const commentsEnabled = ref(true)
const list = ref<ArticleCommentItem[]>([])
const articleId = ref('')
const articleTitle = ref('')

function open(article: { id: string; title: string }) {
  articleId.value = article.id
  articleTitle.value = article.title
  reason.value = ''
  list.value = []
  visible.value = true
  void load()
}

async function load() {
  if (!articleId.value) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchArticleComments(articleId.value)
    list.value = res.list
    commentsEnabled.value = res.commentsEnabled
  } catch (error) {
    /* 加载失败单独置错误态：避免空列表被误显示成「暂无评论」 */
    loadError.value = error instanceof Error ? error.message : '评论加载失败'
  } finally {
    loading.value = false
  }
}

function onRemove(item: ArticleCommentItem) {
  const hint = reason.value.trim() ? '删除后将通过站内信通知作者。' : '未填写原因则不通知作者。'
  const dialog = DialogPlugin.confirm({
    header: '删除评论',
    body: `确认删除 ${item.userName} 的评论「${item.content.slice(0, 40)}${item.content.length > 40 ? '…' : ''}」？${hint}`,
    theme: 'danger',
    confirmBtn: '确认删除',
    cancelBtn: '取消',
    onConfirm: async () => {
      dialog.hide()
      removing.value = item.id
      try {
        await removeArticleComment(item.articleId, item.id, reason.value.trim() || undefined)
        MessagePlugin.success('评论已删除')
        await load()
        emit('success')
      } catch (error) {
        MessagePlugin.error(error instanceof Error ? error.message : '删除失败')
      } finally {
        removing.value = ''
      }
    },
    onClose: () => dialog.hide(),
  })
}

defineExpose({ open })
</script>

<template>
  <t-dialog v-model:visible="visible" :header="`评论治理 · ${articleTitle}`" width="720px" :footer="false">
    <div class="comments-toolbar">
      <t-tag :theme="commentsEnabled ? 'success' : 'default'" variant="light">
        {{ commentsEnabled ? '评论已开启' : '评论已关闭' }}
      </t-tag>
      <t-input v-model="reason" class="reason-input" clearable placeholder="删除原因（选填，填写后通知作者）…" />
    </div>
    <t-loading :loading="loading">
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
      <ListEmptyState v-else-if="!loading && list.length === 0" description="暂无评论" />
      <ul v-else class="comments-list">
        <li v-for="item in list" :key="item.id" class="comment-row">
          <div class="comment-head">
            <span class="comment-author">{{ item.userName }}</span>
            <t-tag size="small" variant="light">{{ item.identityName || item.identityType }}</t-tag>
            <span class="comment-at">{{ item.at }}</span>
          </div>
          <p class="comment-content">{{ item.content }}</p>
          <t-button
            variant="text"
            size="small"
            theme="danger"
            :loading="removing === item.id"
            @click="onRemove(item)"
          >
            删除
          </t-button>
        </li>
      </ul>
    </t-loading>
  </t-dialog>
</template>

<style scoped>
.comments-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.reason-input {
  flex: 1;
}
.comments-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 420px;
  overflow: auto;
}
.comment-row {
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}
.comment-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.comment-author {
  font-weight: 600;
}
.comment-at {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.comment-content {
  margin: 8px 0;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
