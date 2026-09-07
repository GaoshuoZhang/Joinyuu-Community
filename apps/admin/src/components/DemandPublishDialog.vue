<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import {
  createDemand,
  publishDemand,
  saveDemandDraft,
  updateDemand,
  type DemandPublishPayload,
} from '@/api/demands'
import { fetchUser, fetchUserOptions } from '@/api/users'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { Demand, User, UserIdentity } from '@/types'

/* 需求弹窗（三模式共用）：
 * - create：后台直接创建需求（选择提交人 + 提交身份），创建即立即上架；可存草稿（定时发布选项已移除）
 * - publish：草稿完成并发布（可再编辑内容，可设定时发布）
 * - edit：待发布 / 已发布需求再编辑（不改状态）
 * 可报名范围默认与可见范围一致，可单独调整（提供一键同步） */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'publish' | 'edit'
  demand: Demand | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const headerMap = {
  create: '创建需求',
  publish: '完成并发布',
  edit: '编辑需求',
} as const

const confirmTextMap = {
  create: '确认创建',
  publish: '确认发布',
  edit: '保存',
} as const

const categoryOptions = ['供应链', '设计', '法务财务', '技术开发', '市场', '人力资源'].map((c) => ({
  label: c,
  value: c,
}))

const submitting = ref(false)
const formRef = ref()

/* create 模式：提交人与提交身份 */
const userOptions = ref<{ label: string; value: string }[]>([])
const publisherId = ref('')
const identityOptions = ref<{ label: string; value: string }[]>([])
const identityIdx = ref('0')
const publisherUser = ref<User | null>(null)

/* create / 草稿完成（publish+draft）模式：定时发布 */
const scheduledOn = ref(false)
const scheduledAt = ref('')

loadUserOptions()

async function loadUserOptions() {
  userOptions.value = await fetchUserOptions()
}

function identityText(identity: UserIdentity): string {
  if (identity.type === 'individual') return '个人用户'
  if (identity.type === 'community_individual') return `社区个人 · ${identity.title}`
  return `${identity.enterpriseName} · ${identity.title}`
}

/* 选择提交人 → 拉取其身份列表，默认选第一个（个人用户） */
watch(publisherId, async (id) => {
  if (!id) {
    identityOptions.value = []
    identityIdx.value = '0'
    publisherUser.value = null
    return
  }
  try {
    const user = await fetchUser(id)
    publisherUser.value = user
    identityOptions.value = user.identities.map((i, idx) => ({ label: identityText(i), value: String(idx) }))
    identityIdx.value = '0'
  } catch {
    publisherUser.value = null
    identityOptions.value = []
  }
})

const form = reactive<DemandPublishPayload>({
  title: '',
  category: '',
  budget: '',
  period: '',
  description: '',
  visibilityIdentities: [],
  visibilityLevels: [],
  enrollmentIdentities: [],
  enrollmentLevels: [],
  deadline: '',
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    /* 定时开关默认关闭（schedule 模式已移除，草稿完成时按需开启） */
    scheduledOn.value = false
    scheduledAt.value = props.demand?.scheduledAt ?? ''
    if (props.mode === 'create' || !props.demand) {
      form.title = ''
      form.category = ''
      form.budget = ''
      form.period = ''
      form.description = ''
      form.visibilityIdentities = []
      form.visibilityLevels = []
      form.enrollmentIdentities = []
      form.enrollmentLevels = []
      form.deadline = ''
      publisherId.value = ''
    } else {
      form.title = props.demand.title
      form.category = props.demand.category
      form.budget = props.demand.budget
      form.period = props.demand.period
      form.description = props.demand.description
      form.visibilityIdentities = [...props.demand.visibilityIdentities]
      form.visibilityLevels = [...props.demand.visibilityLevels]
      form.enrollmentIdentities = [...props.demand.enrollmentIdentities]
      form.enrollmentLevels = [...props.demand.enrollmentLevels]
      /* 兼容历史仅日期的截止值，补齐时分 */
      form.deadline = /^\d{4}-\d{2}-\d{2}$/.test(props.demand.deadline)
        ? `${props.demand.deadline} 23:59`
        : props.demand.deadline
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 一键同步：可报名范围 ← 可见范围 */
function syncEnrollment() {
  form.enrollmentIdentities = [...form.visibilityIdentities]
  form.enrollmentLevels = [...form.visibilityLevels]
}

/* 规则 trigger 一律 submit：值变化(change)/失焦(blur)的自动校验全部跳过——
 * 弹窗打开重置表单或面板交互均不会提前红框；确认时 formRef.validate()
 * 默认 trigger='all' 会命中全部规则，此时才红框提示 */
const rules = computed<FormProps['rules']>(() => ({
  title: [{ required: true, message: '请输入需求标题', trigger: 'submit' }],
  category: [{ required: true, message: '请选择类别', trigger: 'submit' }],
  deadline: [{ required: true, message: '请选择报名截止时间', trigger: 'submit' }],
  ...(props.mode === 'create'
    ? { publisherId: [{ required: true, message: '请选择提交人', trigger: 'submit' }] }
    : {}),
}))

/* create / 草稿完成（publish+draft）模式：可设置定时发布 */
const canSchedule = computed(
  () => props.mode === 'publish' && props.demand?.status === 'draft',
)

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  if (canSchedule.value && scheduledOn.value && !scheduledAt.value) {
    MessagePlugin.warning('已开启定时发布，请选择发布时间')
    return
  }
  submitting.value = true
  try {
    if (props.mode === 'create') {
      /* 创建需求：不再提供定时发布选项，创建即立即上架 */
      const identity = publisherUser.value?.identities[Number(identityIdx.value)] ?? null
      const demand = await createDemand({
        ...form,
        publisherId: publisherId.value,
        publisherIdentity: identity,
      })
      MessagePlugin.success(`需求已创建并发布（${demand.id}）`)
    } else if (props.demand) {
      if (props.mode === 'publish') {
        /* 草稿：可设置定时发布（设置后转为定时发布中），关闭则立即发布 */
        const willSchedule = props.demand.status === 'draft' && scheduledOn.value
        await publishDemand(props.demand.id, {
          ...form,
          scheduledAt: willSchedule ? scheduledAt.value : undefined,
        })
        MessagePlugin.success(willSchedule ? `已保存，将于 ${scheduledAt.value} 自动发布` : '需求已发布')
      } else {
        await updateDemand(props.demand.id, { ...form })
        MessagePlugin.success('修改已保存')
      }
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

/* 可保存草稿：创建模式，或草稿状态完成发布时（publish 模式 + 状态 draft） */
const canSaveDraft = computed(
  () => props.mode === 'create' || (props.mode === 'publish' && props.demand?.status === 'draft'),
)

/* 保存草稿：不校验必填项，不定时发布；草稿再编辑保存草稿 = 仅更新内容，保持草稿状态 */
const draftSaving = ref(false)

async function onSaveDraft() {
  if (!canSaveDraft.value) return
  if (props.mode === 'create' && !publisherId.value) {
    MessagePlugin.warning('保存草稿前请先选择提交人')
    return
  }
  draftSaving.value = true
  try {
    if (props.mode === 'create') {
      const identity = publisherUser.value?.identities[Number(identityIdx.value)] ?? null
      const demand = await saveDemandDraft({
        ...form,
        publisherId: publisherId.value,
        publisherIdentity: identity,
      })
      MessagePlugin.success(`草稿已保存（${demand.id}），可在需求列表「草稿」状态下继续编辑`)
    } else if (props.demand?.status === 'draft') {
      /* 草稿再编辑：保存草稿仅更新内容，不定时发布、保持草稿状态 */
      await updateDemand(props.demand.id, { ...form })
      MessagePlugin.success('草稿修改已保存，仍可在「草稿」状态下继续编辑')
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '草稿保存失败')
  } finally {
    draftSaving.value = false
  }
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="headerMap[mode]"
    width="640px"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button
          v-if="canSaveDraft"
          variant="outline"
          theme="default"
          :loading="draftSaving"
          @click="onSaveDraft"
        >
          存草稿
        </t-button>
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ confirmTextMap[mode] }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="{ ...form, publisherId: publisherId }" :rules="rules" label-align="top">
      <!-- create 模式：提交人与提交身份 -->
      <template v-if="mode === 'create'">
        <div class="form-row">
          <t-form-item label="提交人" name="publisherId">
            <t-select
              v-model="publisherId"
              :options="userOptions"
              filterable
              clearable
              placeholder="搜索或选择提交用户"
            />
          </t-form-item>
          <t-form-item label="提交身份" name="publisherIdentity">
            <t-select
              v-model="identityIdx"
              :options="identityOptions"
              :disabled="!publisherId"
              placeholder="先选择提交人"
            />
          </t-form-item>
        </div>
      </template>

      <t-form-item label="需求标题" name="title">
        <t-input v-model="form.title" placeholder="请输入需求标题" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="类别" name="category">
          <t-select v-model="form.category" :options="categoryOptions" clearable />
        </t-form-item>
        <t-form-item label="预算" name="budget">
          <t-input v-model="form.budget" placeholder="如 ¥10,000 - 30,000 / 面议" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="项目周期" name="period">
          <t-input v-model="form.period" placeholder="如 4 周" />
        </t-form-item>
        <t-form-item label="报名截止时间" name="deadline">
          <t-date-picker
            v-model="form.deadline"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            style="width: 100%"
          />
        </t-form-item>
      </div>

      <!-- 草稿完成（publish+draft）模式：定时发布 -->
      <t-form-item v-if="canSchedule" label="定时发布">
        <div class="schedule-cell">
          <t-switch v-model="scheduledOn" />
          <t-date-picker
            v-if="scheduledOn"
            v-model="scheduledAt"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            placeholder="到点自动发布"
            style="flex: 1"
          />
          <span v-else class="schedule-tip">关闭并保存将立即发布</span>
        </div>
      </t-form-item>

      <div class="scope-head">
        <span class="scope-title">可见范围</span>
        <span class="scope-tip">决定哪些身份、等级的用户能看到该需求</span>
      </div>
      <div class="form-row">
        <t-form-item label="身份" name="visibilityIdentities">
          <t-select
            v-model="form.visibilityIdentities"
            multiple
            clearable
            :options="visibilityIdentityOptions"
            placeholder="不限"
          />
        </t-form-item>
        <t-form-item label="等级" name="visibilityLevels">
          <t-select v-model="form.visibilityLevels" multiple clearable :options="userLevelOptions" placeholder="不限" />
        </t-form-item>
      </div>

      <div class="scope-head">
        <span class="scope-title">可报名范围</span>
        <div class="scope-right">
          <span class="scope-tip">默认与可见范围一致</span>
          <t-button variant="text" size="small" @click="syncEnrollment">同步可见范围</t-button>
        </div>
      </div>
      <div class="form-row">
        <t-form-item label="身份" name="enrollmentIdentities">
          <t-select
            v-model="form.enrollmentIdentities"
            multiple
            clearable
            :options="visibilityIdentityOptions"
            placeholder="不限"
          />
        </t-form-item>
        <t-form-item label="等级" name="enrollmentLevels">
          <t-select v-model="form.enrollmentLevels" multiple clearable :options="userLevelOptions" placeholder="不限" />
        </t-form-item>
      </div>

      <t-form-item label="需求内容" name="description">
        <t-textarea v-model="form.description" :autosize="{ minRows: 4, maxRows: 8 }" placeholder="需求详细描述" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.schedule-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.schedule-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.scope-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.scope-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.scope-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
