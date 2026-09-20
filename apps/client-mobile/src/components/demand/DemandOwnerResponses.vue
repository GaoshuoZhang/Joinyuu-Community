<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button, Toast } from 'tdesign-mobile-vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyResponseItem } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 发布者视角：响应列表 + 意向承接方多选 + 提交立项。 */
const props = defineProps<{
  responses: MyResponseItem[]
  loading: boolean
  error: boolean
  canSelect: boolean
  selecting: boolean
  emptyNotice: string
  demandStatus: string
}>()

const emit = defineEmits<{
  retry: []
  submit: [ids: string[]]
}>()

const selection = ref<string[]>([])

/* 列表刷新后清空多选（提交成功会触发父级重新拉取） */
watch(
  () => props.responses,
  () => {
    selection.value = []
  },
)

function toggleSelection(responseId: string) {
  const index = selection.value.indexOf(responseId)
  if (index >= 0) selection.value.splice(index, 1)
  else selection.value.push(responseId)
}

function onSubmit() {
  if (!selection.value.length) {
    Toast('请至少选择一位意向承接方')
    return
  }
  emit('submit', [...selection.value])
}
</script>

<template>
  <p v-if="loading" class="owner-loading">响应加载中…</p>
  <p v-else-if="error" class="owner-error">
    响应加载失败
    <Button class="relink" size="small" variant="text" theme="danger" @click="emit('retry')">重试</Button>
  </p>
  <template v-else>
    <p v-if="!responses.length" class="notice">{{ emptyNotice }}</p>
    <template v-else>
      <div
        v-for="r in responses"
        :key="r.id"
        class="owner-response"
        :class="{ 'is-chosen': r.status === 'accepted' }"
      >
        <div class="owner-response-head">
          <strong>{{ r.responderName ?? '响应方' }}</strong>
          <StateTag kind="response" :value="r.status ?? 'pending'" />
        </div>
        <p class="owner-response-note">{{ r.note }}</p>
        <p class="owner-response-meta">{{ formatLocalDateTime(r.at) }}</p>
        <Button
          v-if="canSelect && (r.status ?? 'pending') === 'pending'"
          size="small"
          variant="outline"
          :theme="selection.includes(r.id) ? 'primary' : 'default'"
          @click="toggleSelection(r.id)"
        >
          {{ selection.includes(r.id) ? '已选择' : '选择为意向承接方' }}
        </Button>
      </div>
      <p v-if="canSelect" class="selection-tip">可多选意向承接方；提交后需求转为「已选定」，由社区管理员确认后立项</p>
      <Button
        v-if="canSelect"
        theme="primary"
        block
        class="submit-btn"
        :loading="selecting"
        @click="onSubmit"
      >
          提交立项{{ selection.length ? `（已选 ${formatZhNumber(selection.length)} 项）` : '' }}
      </Button>
      <p v-else-if="demandStatus === 'selected'" class="notice done">等待社区管理员确认立项</p>
    </template>
  </template>
</template>

<style scoped>
.owner-loading {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.owner-error {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.relink {
  margin-left: var(--app-space-2);
}

.notice {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
  border: 1px dashed var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding: var(--app-space-6) var(--app-space-7);
}

.notice.done {
  color: var(--td-success-color);
  border-style: solid;
}

.owner-response {
  padding: var(--app-space-6) var(--app-space-7);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-page);
}

.owner-response + .owner-response {
  margin-top: var(--app-space-5);
}

.owner-response.is-chosen {
  border-color: var(--td-success-color-3);
  background: var(--td-success-color-1);
}

.owner-response-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
  font-size: var(--app-font-body);
}

.owner-response-note {
  margin: var(--app-space-4) 0 0;
  font-size: var(--app-font-body);
  line-height: 1.7;
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.owner-response-meta {
  margin: var(--app-space-4) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.selection-tip {
  margin: var(--app-space-5) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.submit-btn {
  margin-top: var(--app-space-5);
}
</style>
