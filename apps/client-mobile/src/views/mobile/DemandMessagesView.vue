<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Loading, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchDemandMessages, sendDemandMessage } from '@/api/demands'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 需求沟通：发布方与响应者的一对多留言板（Mock；接入期为会话/IM 服务）。 */
const route = useRoute()
const demandId = String(route.params.id)
const { data, loading, error, run } = useAsyncList(() => fetchDemandMessages(demandId))
onMounted(run)

const input = ref('')
const sending = ref(false)

async function onSend() {
  if (!input.value.trim()) return
  sending.value = true
  try {
    await sendDemandMessage(demandId, input.value)
    input.value = ''
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="page-fade-in msg-page">
    <p class="tip">仅需求发布方与响应者可见，沟通内容将作为合作依据。</p>
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!(data ?? []).length" text="还没有消息，先打个招呼吧" />
    <div v-else class="bubbles stagger">
      <div v-for="m in data" :key="m.id" class="bubble-row" :class="{ mine: m.mine }">
        <div class="bubble">
          <p class="bubble-name">{{ m.name }}</p>
          <p class="bubble-content">{{ m.content }}</p>
          <p class="bubble-at">{{ m.at }}</p>
        </div>
      </div>
    </div>
    <div class="composer">
      <Textarea v-model="input" :autosize="{ minRows: 1, maxRows: 3 }" :maxlength="200" placeholder="输入消息…" />
      <Button theme="primary" size="small" :loading="sending" @click="onSend">发送</Button>
    </div>
  </div>
</template>

<style scoped>
.msg-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px 96px;
}

.tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.bubbles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bubble-row {
  display: flex;
}

.bubble-row.mine {
  justify-content: flex-end;
}

.bubble {
  max-width: 80%;
  padding: 10px 12px;
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-1);
}

.bubble-row.mine .bubble {
  background: var(--td-brand-color-1);
}

.bubble-name {
  margin: 0 0 2px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}

.bubble-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble-at {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.composer {
  position: fixed;
  right: 0;
  bottom: calc(var(--app-mobile-tabbar-h) + 8px + env(safe-area-inset-bottom));
  left: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px;
  /* v42：避免右下角 Mock 开发者工具悬浮按钮遮挡发送键 */
  padding-right: 68px;
  z-index: 20;
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
}

.composer :deep(.t-textarea) {
  flex: 1;
}
</style>
