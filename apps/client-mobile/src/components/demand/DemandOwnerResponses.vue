<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button, DialogPlugin, Toast } from 'tdesign-mobile-vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
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
  /* v48：提交立项不可逆（需求转已选定、由社区管理员立项），二次确认时复述后果 */
  DialogPlugin.confirm({
    title: '提交立项',
    content: `已选择 ${formatZhNumber(selection.value.length)} 位意向承接方。提交后将确定承接方并进入立项流程，不可更改。`,
    cancelBtn: '再想想',
    confirmBtn: '确认提交',
    onConfirm: () => emit('submit', [...selection.value]),
  })
}
</script>

<template>
  <ListSkeleton v-if="loading" :rows="2" />
  <EmptyBlock v-else-if="error" text="响应加载失败" action-text="重试" @action="emit('retry')" />
  <EmptyBlock v-else-if="!responses.length" :text="emptyNotice" />
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
      <p v-if="r.note" class="owner-response-note">{{ r.note }}</p>
      <!-- 响应时选填的次要信息：按有无渲染（v51 起完整换行展示，不再截断）；
           响应审核通过时管理员可勾选「向需求方显示」的字段，未勾选的字段服务端不下发 -->
      <p v-if="r.quote" class="owner-response-detail">报价：{{ r.quote }}</p>
      <p v-if="r.timeline" class="owner-response-detail">可投入时间：{{ r.timeline }}</p>
      <p v-if="r.cases" class="owner-response-detail">案例：{{ r.cases }}</p>
      <p v-if="r.phone" class="owner-response-detail">手机：{{ r.phone }}</p>
      <p v-if="r.email" class="owner-response-detail">邮箱：{{ r.email }}</p>
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

<style scoped>
/* 空态/错误态用 EmptyBlock 承载，仅保留「已选定等待立项」这一条状态提示 */
.notice {
  margin: 0;
  font: var(--app-type-body-sm);
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
  font: var(--app-type-body);
}

.owner-response-note {
  margin: var(--app-space-4) 0 0;
  font: var(--app-type-body);
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.owner-response-detail {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
  /* v51：报价/工期/案例/手机号是发布者选定承接方的依据，原先单行省略号在触摸端
   * 没有任何查看完整值的途径（title 在触摸端不显示）；改为换行完整展示。 */
  overflow-wrap: anywhere;
}

.owner-response-meta {
  margin: var(--app-space-4) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.selection-tip {
  margin: var(--app-space-5) 0 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.submit-btn {
  margin-top: var(--app-space-5);
}
</style>
