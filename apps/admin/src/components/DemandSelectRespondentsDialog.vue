<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { identityLabelOf } from '@/constants/identity'
import { userSubjectLabel } from '@/utils/subjectLabel'
import type { Demand, DemandRespondent } from '@/types'

/* 立项前置「选定承接方」弹窗（item 5）：
 * 仅用于社区人员（后台代发，publisherIdentity.type = official）创建且存在「待选定」响应的需求——
 * 点「立项」时先在此处多选承接方，选定结果带入「需求立项」表单并随立项提交（服务端落「已承接」）；
 * 「跳过选定」= 不勾选任何响应直接进入立项表单，承接方在表单内手动选择。 */

const props = defineProps<{
  visible: boolean
  demand: Demand | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  /** 选定结果（响应记录 ID，可空 = 跳过选定）；父级据此打开「需求立项」表单 */
  (e: 'confirm', respondentIds: number[]): void
}>()

const selectedIds = ref<number[]>([])

/* 候选响应：仅「待选定」（已通过审核且未被选定）；已撤回记录服务端已过滤 */
const candidates = computed<DemandRespondent[]>(() =>
  (props.demand?.respondents ?? []).filter((row) => row.status === 'pending'),
)

/* 响应方展示口径：真实姓名（身份 · 昵称 · 用户 ID），避免同名/同昵称用户混淆；代报名无账号回落快照姓名 */
function respondentLabel(row: DemandRespondent): string {
  return row.userId
    ? userSubjectLabel({ realName: row.realName, nickname: row.nickname, uid: row.userId, identity: identityLabelOf(row.responderIdentity) })
    : row.name
}

/* 响应补充信息：报价 / 工期，仅拼接存在的项 */
function respondentMeta(row: DemandRespondent): string {
  const parts: string[] = []
  if (row.quote) parts.push(`报价 ${row.quote}`)
  if (row.timeline) parts.push(`工期 ${row.timeline}`)
  return parts.join(' · ')
}

/* 整行可点：点击行内容切换勾选（复选框自身保留原生键盘与读屏行为，用 @click.stop 避免双切换） */
function toggle(id: number) {
  const index = selectedIds.value.indexOf(id)
  if (index >= 0) selectedIds.value.splice(index, 1)
  else selectedIds.value.push(id)
}

watch(
  () => props.visible,
  (v) => {
    if (v) selectedIds.value = []
  },
)

function close() {
  emit('update:visible', false)
}

/* 跳过选定：不勾选任何响应，直接进入立项表单 */
function onSkip() {
  emit('confirm', [])
}

function onNext() {
  emit('confirm', [...selectedIds.value])
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="`选定承接方 · ${demand?.title ?? ''}`"
    width="640px"
    :footer="false"
    @close="close"
  >
    <p class="select-hint">
      该需求由社区人员创建，请先选定本次立项的承接方（可多选），选定结果将自动带入「需求立项」表单。
    </p>
    <t-checkbox-group v-model="selectedIds" class="candidate-group">
      <div v-for="row in candidates" :key="row.id" class="candidate" @click="toggle(row.id)">
        <!-- 复选框自身处理勾选与键盘操作；阻止冒泡避免与整行点击重复切换 -->
        <span class="candidate-check" @click.stop>
          <t-checkbox :value="row.id" :aria-label="`选定 ${respondentLabel(row)}`" />
        </span>
        <div class="candidate-body">
          <div class="candidate-head">
            <span class="candidate-name" :title="respondentLabel(row)">{{ respondentLabel(row) }}</span>
            <t-tag v-if="row.enterprise" size="small" variant="light">{{ row.enterprise }}</t-tag>
          </div>
          <div v-if="respondentMeta(row)" class="candidate-meta">{{ respondentMeta(row) }}</div>
          <p class="candidate-message" :title="row.message">{{ row.message }}</p>
          <p v-if="row.cases" class="candidate-cases" :title="row.cases">案例：{{ row.cases }}</p>
        </div>
      </div>
    </t-checkbox-group>
    <p v-if="candidates.length === 0" class="select-empty">暂无待选定的响应，可直接进入立项表单。</p>
    <div class="select-footer">
      <t-button variant="text" theme="default" @click="onSkip">跳过选定</t-button>
      <t-button theme="primary" :disabled="selectedIds.length === 0" @click="onNext">
        下一步（已选 {{ selectedIds.length }}）
      </t-button>
    </div>
  </t-dialog>
</template>

<style scoped>
.select-hint {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--td-text-color-secondary);
}

.candidate-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.candidate {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  cursor: pointer;
}

/* 复选框列：与行内容基线对齐 */
.candidate-check {
  display: inline-flex;
  flex: none;
  padding-top: 2px;
}

.candidate-body {
  min-width: 0;
  flex: 1;
}

.candidate-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.candidate-name {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.candidate-meta,
.candidate-cases {
  margin-top: 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.candidate-message {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.select-empty {
  margin: 0;
  padding: 12px 0;
  text-align: center;
  color: var(--td-text-color-placeholder);
}

.select-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
