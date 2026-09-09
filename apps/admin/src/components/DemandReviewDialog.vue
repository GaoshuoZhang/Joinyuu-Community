<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import IdentityTags from '@/components/IdentityTags.vue'
import { identityTypeMap, userLevelMap } from '@/constants/identity'
import { approveDemand, rejectDemand } from '@/api/demands'
import type { Demand } from '@/types'

/* 只读审核对话框：待审核需求仅读查看，不允许编辑任何项。
 * 底部按钮（从左到右）：取消 / 驳回 / 通过——通过 = 转为待发布；驳回 = 必须填写驳回原因；
 * 取消 = 关闭窗口不做任何动作。 */
const props = defineProps<{
  visible: boolean
  demand: Demand | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

type Phase = 'review' | 'reject'
const phase = ref<Phase>('review')
const rejectReason = ref('')
const submitting = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    /* 每次打开回到审核视图，清空驳回原因 */
    phase.value = 'review'
    rejectReason.value = ''
    nextTick(() => formRef.value?.clearValidate())
  },
)

const formRef = ref()

/* 驳回：进入填写原因视图 */
function onReject() {
  phase.value = 'reject'
}

function onCancel() {
  phase.value = 'review'
  emit('update:visible', false)
}

async function onApprove() {
  if (!props.demand) return
  submitting.value = true
  try {
    await approveDemand(props.demand.id)
    MessagePlugin.success('已通过审核，需求转入待发布')
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

async function onConfirmReject() {
  if (!props.demand) return
  if (!rejectReason.value.trim()) {
    MessagePlugin.warning('请填写驳回原因')
    return
  }
  submitting.value = true
  try {
    await rejectDemand(props.demand.id, rejectReason.value.trim())
    MessagePlugin.success('已驳回该需求')
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

/* 范围拼接展示（只读） */
function scopeItems(identities: string[]): string[] {
  const names = identities.map((t) => identityTypeMap[t as keyof typeof identityTypeMap] ?? t)
  return names
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="审核需求"
    width="640px"
    @close="onCancel"
  >
    <template #footer>
      <div class="dialog-footer">
        <template v-if="phase === 'review'">
          <t-button variant="text" theme="default" @click="onCancel">取消</t-button>
          <t-button variant="outline" theme="danger" @click="onReject">驳回</t-button>
          <t-button theme="primary" :loading="submitting" @click="onApprove">通过</t-button>
        </template>
        <template v-else>
          <t-button variant="text" theme="default" @click="phase = 'review'">返回</t-button>
          <t-button theme="danger" :loading="submitting" @click="onConfirmReject">确认驳回</t-button>
        </template>
      </div>
    </template>

    <template v-if="demand">
      <template v-if="phase === 'review'">
        <t-alert theme="warning" title="只读审核" message="需求审核阶段不支持编辑；通过后转为「待发布」，由运营决定发布时间。" />

        <div class="review-title">{{ demand.title }}</div>
        <div class="review-meta">
          <span class="meta-item">编号：{{ demand.id }}</span>
          <span class="meta-item">类别：{{ demand.category || '—' }}</span>
        </div>

        <t-descriptions :column="2" bordered class="review-desc">
          <t-descriptions-item label="提交人">{{ demand.publisherName }}（{{ demand.publisherId }}）</t-descriptions-item>
          <t-descriptions-item label="提交身份">
            <IdentityTags :identities="demand.publisherIdentity ? [demand.publisherIdentity] : []" />
          </t-descriptions-item>
          <t-descriptions-item label="联系人">{{ demand.contactName ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系电话">{{ demand.contactPhone ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系邮箱">{{ demand.contactEmail ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="预算">{{ demand.budget || '—' }}</t-descriptions-item>
          <t-descriptions-item label="预期交付截止日">{{ demand.period || '—' }}</t-descriptions-item>
          <t-descriptions-item label="报名截止时间">{{ demand.deadline || '—' }}</t-descriptions-item>
          <t-descriptions-item label="创建时间">{{ demand.createdAt }}</t-descriptions-item>
        </t-descriptions>

        <h4 class="block-title">需求内容</h4>
        <p class="desc-text">{{ demand.description || '—' }}</p>
      </template>

      <template v-else>
        <t-form ref="formRef" label-align="top">
          <p class="reject-tip">驳回后该需求将标记为「已驳回」并通知提交人，请填写驳回原因。</p>
          <t-form-item :rules="[{ required: true, message: '请填写驳回原因', trigger: 'submit' }]" name="rejectReason">
            <t-textarea
              v-model="rejectReason"
              placeholder="驳回原因（必填，将通知提交人）"
              :autosize="{ minRows: 3, maxRows: 5 }"
            />
          </t-form-item>
        </t-form>
      </template>
    </template>
  </t-dialog>
</template>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.review-title {
  margin: 16px 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.review-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin-bottom: 16px;
}

.meta-item {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.review-desc {
  margin-bottom: 4px;
}

.block-title {
  margin: 16px 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.desc-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
}

.tags-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.reject-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}
</style>