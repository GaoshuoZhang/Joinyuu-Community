<script setup lang="ts">
import { ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { fetchArticleDetail, reviewArticle } from '@/api/contents'
import type { Article } from '@/types'

/* 文章审阅抽屉：审核模式（待审核投稿）支持驳回/通过；只读模式（定时发布中查看详情）仅展示 */
const props = defineProps<{
  visible: boolean
  article: Article | null
  /** 只读模式：不展示驳回/通过操作（定时发布中「查看详情」使用） */
  readonly?: boolean
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const rejecting = ref(false)
const reason = ref('')
const acting = ref('')
const detail = ref<Article | null>(null)
const detailLoading = ref(false)

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    rejecting.value = false
    reason.value = ''
    detail.value = props.article
    if (!props.article) return
    detailLoading.value = true
    try {
      detail.value = await fetchArticleDetail(props.article.id)
    } catch (e) {
      MessagePlugin.error(e instanceof Error ? e.message : '文章详情加载失败')
    } finally {
      detailLoading.value = false
    }
  },
)

async function onApprove() {
  if (!props.article) return
  acting.value = 'approve'
  try {
    await reviewArticle(props.article.id, 'approved')
    MessagePlugin.success('审核通过，文章已转为待发布')
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

async function onReject() {
  if (!props.article) return
  if (!reason.value.trim()) {
    MessagePlugin.warning('请填写驳回原因')
    return
  }
  acting.value = 'reject'
  try {
    await reviewArticle(props.article.id, 'rejected', reason.value.trim())
    MessagePlugin.success('已驳回投稿')
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

function onCancel() {
  emit('update:visible', false)
}
</script>

<template>
  <t-drawer
    :visible="visible"
    :header="title ?? `审核投稿 · ${article?.title ?? ''}`"
    size="720px"
    :footer="false"
    :close-btn="true"
    :close-on-esc-keydown="true"
    @close="onCancel"
  >
    <t-loading :loading="detailLoading" show-overlay>
    <div v-if="detail" class="review-body">
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">作者</span>
           <span class="meta-value">{{ detail.authorName }}<t-tag v-if="detail.authorId" class="id-tag" size="small" variant="light">{{ detail.authorId }}</t-tag></span>
        </div>
        <div class="meta-item">
          <span class="meta-label">栏目</span>
           <span class="meta-value">{{ detail.columnNames.join('、') || '—' }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">提交时间</span>
           <span class="meta-value">{{ detail.createdAt }}</span>
        </div>
      </div>

      <h4 class="block-title">内容摘要</h4>
       <p class="block-summary">{{ detail.summary }}</p>

      <h4 class="block-title">正文内容</h4>
      <div class="block-content">
         <div class="rich-text" v-html="detail.content"></div>
         <p v-if="!detail.content" class="empty-tip">（无正文内容）</p>
      </div>

       <div v-if="detail.tags.length" class="block-tags">
         <t-tag v-for="t in detail.tags" :key="t" variant="outline" size="small">{{ t }}</t-tag>
       </div>

       <h4 class="block-title">评论设置</h4>
       <p class="block-summary">{{ detail.commentsEnabled ? '允许成员查看并发表评论' : '评论已关闭' }}</p>

       <template v-if="detail.takedowns?.length">
         <h4 class="block-title">下架记录</h4>
         <div class="takedown-list">
           <div v-for="item in detail.takedowns" :key="item.id" class="takedown-item">
             <div class="takedown-head">
               <span>管理员下架</span>
               <t-tag :theme="item.restoredAt ? 'success' : 'default'" variant="light" size="small">
                 {{ item.restoredAt ? '已恢复' : '生效中' }}
               </t-tag>
             </div>
             <p>下架：{{ item.takenDownAt }} · {{ item.takenDownBy }}</p>
            <p>理由：{{ item.reason || '未填写理由' }}</p>
            <p v-if="item.restoredAt">恢复：{{ item.restoredAt }} · {{ item.restoredBy || '—' }}</p>
           </div>
         </div>
       </template>

      <div v-if="rejecting" class="reject-box">
        <t-textarea v-model="reason" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="请填写驳回原因（通知投稿人）…" maxlength="200" />
      </div>
    </div>
    </t-loading>

    <div v-if="article" class="drawer-footer">
      <t-button variant="text" theme="default" @click="onCancel">
        {{ readonly ? '关闭' : '取消' }}
      </t-button>
      <template v-if="!readonly">
        <t-button
          v-if="rejecting"
          theme="danger"
          :loading="acting === 'reject'"
          @click="onReject"
        >
          确认驳回
        </t-button>
        <t-button v-else variant="outline" theme="danger" :disabled="detailLoading" @click="rejecting = true">驳回</t-button>
        <t-button v-if="!rejecting" theme="primary" :loading="acting === 'approve'" :disabled="detailLoading" @click="onApprove">通过</t-button>
      </template>
    </div>
  </t-drawer>
</template>

<style scoped>
.review-body {
  font-size: 14px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 16px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.meta-label {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.meta-value {
  font-size: 14px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-title {
  margin: 12px 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.block-summary {
  margin: 0;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.block-content {
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.7;
}

.empty-tip {
  color: var(--td-text-color-placeholder);
}

.block-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.reject-box {
  margin-top: 16px;
}

.takedown-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.takedown-item {
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
  background: var(--td-bg-color-secondarycontainer);
}

.takedown-item p {
  margin: 4px 0 0;
  color: var(--td-text-color-secondary);
  line-height: 1.5;
}

.takedown-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.drawer-footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
}
</style>
