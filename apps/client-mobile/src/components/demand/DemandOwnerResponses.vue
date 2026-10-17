<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyResponseItem } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'
import { identityLabels, userSubjectLabel } from '@/utils/subjectLabel'

/* 发布者视角：响应列表 + 意向承接方多选 + 提交立项；`selected` 态支持重新选定 / 撤销选定。 */
const props = withDefaults(defineProps<{
  responses: MyResponseItem[]
  loading: boolean
  error: boolean
  canSelect: boolean
  /** `selected` 态：允许重新选定（覆盖上一次）或撤销选定 */
  reselect?: boolean
  /** `reselect` 时上一次已选定（accepted）的响应 ID，用于预勾选 */
  chosenIds?: string[]
  selecting: boolean
  emptyNotice: string
  demandStatus: string
}>(), { reselect: false, chosenIds: () => [] })

const emit = defineEmits<{
  retry: []
  submit: [ids: string[]]
  deselect: []
}>()

const selection = ref<string[]>([])

/* 列表刷新或进入重新选定态时重置多选：初次选定清空，重新选定回填上一次的选定结果 */
watch(
  [() => props.responses, () => props.reselect, () => props.chosenIds],
  () => {
    selection.value = props.reselect ? [...props.chosenIds] : []
  },
  { immediate: true },
)

/* 可选行：初次选定仅「待选定」；重新选定时「待选定」与「已选定」均可切换（可改选/取消） */
function selectable(r: MyResponseItem): boolean {
  const status = r.status ?? 'pending'
  if (props.canSelect) return status === 'pending'
  if (props.reselect) return status === 'pending' || status === 'accepted'
  return false
}

const submitLabel = computed(() => {
  const count = selection.value.length ? `（已选 ${formatZhNumber(selection.value.length)} 项）` : ''
  return props.canSelect ? `提交立项${count}` : `保存新的承接方${count}`
})

const tipText = computed(() =>
  props.canSelect
    ? '可多选意向承接方；提交后需求转为「已选定」，由社区管理员确认后立项'
    : '可重新选定承接方：保存后覆盖上一次的选定结果；也可直接撤销选定，需求回到「已发布」',
)

function toggleSelection(responseId: string) {
  const index = selection.value.indexOf(responseId)
  if (index >= 0) selection.value.splice(index, 1)
  else selection.value.push(responseId)
}

/* 响应人展示口径：真实姓名（身份 · 昵称），避免同名/同昵称响应者混淆（客户端不展示用户 ID） */
function responderLabel(r: MyResponseItem): string {
  const identity = r.responderIdentity ? identityLabels[r.responderIdentity] ?? '' : ''
  return userSubjectLabel({
    realName: r.responderRealName ?? r.responderName,
    nickname: r.responderNickname,
    identity,
  }) || '响应方'
}

function onSubmit() {
  if (!selection.value.length) {
    Toast('请至少选择一位意向承接方')
    return
  }
  const confirmWord = props.canSelect
    ? { title: '提交立项', content: `已选择 ${formatZhNumber(selection.value.length)} 位意向承接方。提交后将确定承接方并进入立项流程，不可更改。` }
    : { title: '保存新的承接方', content: `已选择 ${formatZhNumber(selection.value.length)} 位意向承接方。保存后将覆盖上一次的选定结果。` }
  /* v48：提交立项不可逆（需求转已选定、由社区管理员立项），二次确认时复述后果 */
  confirmDialog({
    title: confirmWord.title,
    content: confirmWord.content,
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
        <strong>{{ responderLabel(r) }}</strong>
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
        v-if="selectable(r)"
        size="small"
        variant="outline"
        :theme="selection.includes(r.id) ? 'primary' : 'default'"
        :aria-pressed="selection.includes(r.id)"
        @click="toggleSelection(r.id)"
      >
        {{ selection.includes(r.id) ? '已选择' : '选择为意向承接方' }}
      </Button>
    </div>
    <p v-if="canSelect || reselect" class="selection-tip">{{ tipText }}</p>
    <Button
      v-if="canSelect || reselect"
      theme="primary"
      block
      class="submit-btn"
      :loading="selecting"
      @click="onSubmit"
    >
      {{ submitLabel }}
    </Button>
    <!-- 撤销选定：回到「已发布」，重新开放响应与选定（仅 selected 态） -->
    <Button
      v-if="reselect"
      variant="outline"
      block
      class="deselect-btn"
      :loading="selecting"
      @click="emit('deselect')"
    >
      撤销选定
    </Button>
    <p v-if="demandStatus === 'selected'" class="notice done">等待社区管理员确认立项</p>
  </template>
</template>

<style scoped>
/* 空态/错误态用 EmptyBlock 承载，仅保留「已选定等待立项」这一条状态提示 */
.notice {
  /* 与上方响应卡片保持同档间距（item 6：修复「等待社区管理员确认立项」与卡片粘连） */
  margin: var(--app-space-5) 0 0;
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

.deselect-btn {
  margin-top: var(--app-space-4);
}
</style>
