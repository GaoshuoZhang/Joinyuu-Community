<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin, type FormProps } from 'tdesign-vue-next'
import { identityLabelOf } from '@/constants/identity'
import { approveDemand, rejectDemand } from '@/api/demands'
import type { Demand } from '@/types'

/* 只读审核抽屉：待审核需求仅读查看，不允许编辑任何项。
 * 底部按钮（从左到右）：取消 / 驳回 / 通过——通过 = 转为待发布；驳回 = 必须填写驳回原因；
 * 取消 = 关闭抽屉不做任何动作。 */
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
const rejectForm = reactive({ rejectReason: '' })
const rejectRules: FormProps['rules'] = {
  rejectReason: [{ required: true, message: '请填写驳回原因', trigger: 'submit' }],
}
const submitting = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    /* 每次打开回到审核视图，清空驳回原因 */
    phase.value = 'review'
    rejectForm.rejectReason = ''
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
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    await rejectDemand(props.demand.id, rejectForm.rejectReason.trim())
    MessagePlugin.success('已驳回该需求')
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

/* 提交人身份快照 → 纯文本标签（社区官方显示工作人员角色名；企业仅显示 社区企业/合作企业，不追加成员标题） */
function publisherIdentityLabel(d: Demand): string {
  return identityLabelOf(d.publisherIdentity)
}
</script>

<template>
  <t-drawer
    :visible="visible"
    header="审核需求"
    size="560px"
    :footer="false"
    :close-btn="true"
    :close-on-esc-keydown="true"
    @close="onCancel"
  >
    <template v-if="demand">
      <template v-if="phase === 'review'">
        <t-alert theme="warning" title="只读审核" message="需求审核阶段不支持编辑；通过后转为「待发布」，由运营决定发布时间。" />

        <div class="review-title">{{ demand.title }}</div>
        <div class="review-meta">
          <span class="meta-item">编号：{{ demand.id }}</span>
          <span class="meta-item">类别：{{ (demand.categoryLabel ?? demand.category) || '—' }}</span>
        </div>

        <t-descriptions :column="2" bordered class="review-desc">
          <t-descriptions-item label="提交人">{{ demand.publisherName }}<t-tag v-if="demand.publisherId" class="id-tag" size="small" variant="light">{{ demand.publisherId }}</t-tag></t-descriptions-item>
          <t-descriptions-item label="提交人身份">
            <span>{{ publisherIdentityLabel(demand) }}</span>
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
        <div class="desc-text rich-text" v-html="demand.description || '—'"></div>
      </template>

      <template v-else>
        <t-form ref="formRef" :data="rejectForm" :rules="rejectRules" label-align="top">
          <p class="reject-tip">驳回后该需求将标记为「已驳回」并通知提交人，请填写驳回原因。</p>
          <t-form-item name="rejectReason">
            <t-textarea
              v-model="rejectForm.rejectReason"
              placeholder="驳回原因（必填，将通知提交人）…"
              :autosize="{ minRows: 3, maxRows: 5 }"
            />
          </t-form-item>
        </t-form>
      </template>

      <div class="drawer-footer">
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
  </t-drawer>
</template>

<style scoped>
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
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.review-desc {
  margin-bottom: 4px;
}

/* 联系邮箱等无空格长文本在描述表格中强制换行，避免溢出撑破抽屉。
 * 依赖 TDesign descriptions 内部类 .t-descriptions__content，组件无样式 API 可替代 */
.review-desc :deep(.t-descriptions__content) {
  overflow-wrap: anywhere;
}

.block-title {
  margin: 16px 0 8px;
  font-size: 16px;
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
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
