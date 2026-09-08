<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { createDemand, fetchPublisherOptions, updateDemand, type DemandPublishPayload } from '@/api/demands'
import { fetchUser } from '@/api/users'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { Demand, User, UserIdentity } from '@/types'

/* 需求弹窗（双模式共用）：
 * - create：后台直接创建需求，提交人可选已注册个人用户/企业（自动填充联系方式），
 *   或直接输入未注册提交人创建条目；创建即立即上架，无草稿与定时发布
 * - edit：待发布 / 已发布需求再编辑（不改状态）
 * 可报名范围默认与可见范围一致，可单独调整（提供一键同步） */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  demand: Demand | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const headerMap = {
  create: '创建需求',
  edit: '编辑需求',
} as const

const confirmTextMap = {
  create: '确认创建',
  edit: '保存',
} as const

const categoryOptions = ['供应链', '设计', '法务财务', '技术开发', '市场', '人力资源'].map((c) => ({
  label: c,
  value: c,
}))

const submitting = ref(false)
const formRef = ref()

/* create 模式：提交人（可创建新条目）与提交身份 */
const publisherUsers = ref<{ uid: string; nickname: string; phone: string; email: string }[]>([])
const publisherEnterprises = ref<{ id: string; name: string; contactPhone: string; contactEmail?: string }[]>([])
const publisherValue = ref('')
const publisherId = ref('')
const publisherName = ref('')
const publisherType = ref<'individual' | 'enterprise' | 'custom'>('individual')
const identityOptions = ref<{ label: string; value: string }[]>([])
const identityIdx = ref('0')
const publisherUser = ref<User | null>(null)

loadPublisherOptions()

async function loadPublisherOptions() {
  try {
    const opts = await fetchPublisherOptions()
    publisherUsers.value = opts.users
    publisherEnterprises.value = opts.enterprises
  } catch {
    MessagePlugin.error('提交人选项加载失败')
  }
}

/* 提交人选项：全部企业 + 全部个人用户；配合 creatable 支持直接输入未注册提交人 */
const publisherOptions = computed(() => [
  ...publisherEnterprises.value.map((e) => ({ label: `${e.name}（企业 · ${e.id}）`, value: `E:${e.id}` })),
  ...publisherUsers.value.map((u) => ({ label: `${u.nickname}（个人用户 · ${u.uid}）`, value: `U:${u.uid}` })),
])

/* 提交身份文案 */
function identityText(identity: UserIdentity): string {
  if (identity.type === 'individual') return '个人用户'
  if (identity.type === 'community_individual') return `社区个人 · ${identity.title}`
  return `${identity.enterpriseName} · ${identity.title}`
}

/* 选择提交人 → 解析类型并自动填充联系方式（未注册条目不填充）；
 * 注册个人用户 → 拉取身份列表供选择提交身份 */
watch(publisherValue, async (v) => {
  identityOptions.value = []
  identityIdx.value = '0'
  publisherUser.value = null
  if (v.startsWith('E:')) {
    const e = publisherEnterprises.value.find((x) => `E:${x.id}` === v)
    if (!e) return
    publisherId.value = e.id
    publisherName.value = e.name
    publisherType.value = 'enterprise'
    form.contactPhone = e.contactPhone
    form.contactEmail = e.contactEmail ?? ''
  } else if (v.startsWith('U:')) {
    const u = publisherUsers.value.find((x) => `U:${x.uid}` === v)
    if (!u) return
    publisherId.value = u.uid
    publisherName.value = u.nickname
    publisherType.value = 'individual'
    form.contactPhone = u.phone
    form.contactEmail = u.email
    try {
      const user = await fetchUser(u.uid)
      publisherUser.value = user
      identityOptions.value = user.identities.map((i, idx) => ({ label: identityText(i), value: String(idx) }))
      identityIdx.value = '0'
    } catch {
      publisherUser.value = null
    }
  } else if (v) {
    /* creatable 自建条目：值即名称 */
    publisherId.value = ''
    publisherName.value = v
    publisherType.value = 'custom'
    form.contactPhone = ''
    form.contactEmail = ''
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
  contactPhone: '',
  contactEmail: '',
})

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
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
      form.contactPhone = ''
      form.contactEmail = ''
      publisherValue.value = ''
      publisherId.value = ''
      publisherName.value = ''
      publisherType.value = 'individual'
      identityOptions.value = []
      identityIdx.value = '0'
      publisherUser.value = null
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
      form.contactPhone = props.demand.contactPhone ?? ''
      form.contactEmail = props.demand.contactEmail ?? ''
      publisherId.value = props.demand.publisherId
      publisherName.value = props.demand.publisherName
      publisherValue.value = props.demand.publisherId.startsWith('E')
        ? `E:${props.demand.publisherId}`
        : props.demand.publisherId.startsWith('U')
          ? `U:${props.demand.publisherId}`
          : props.demand.publisherName
      publisherType.value = props.demand.publisherId.startsWith('E')
        ? 'enterprise'
        : props.demand.publisherId.startsWith('U')
          ? 'individual'
          : 'custom'
      if (publisherType.value === 'individual') {
        try {
          const user = await fetchUser(props.demand.publisherId)
          publisherUser.value = user
          identityOptions.value = user.identities.map((i, idx) => ({ label: identityText(i), value: String(idx) }))
          identityIdx.value = String(
            Math.max(
              0,
              user.identities.findIndex(
                (i) => JSON.stringify(i) === JSON.stringify(props.demand?.publisherIdentity),
              ),
            ),
          )
        } catch {
          publisherUser.value = null
        }
      } else {
        identityOptions.value = []
        identityIdx.value = '0'
        publisherUser.value = null
      }
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
  publisherValue: [{ required: true, message: '请选择或输入提交人', trigger: 'submit' }],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'submit' }],
  ...(props.mode === 'create'
    ? {}
    : {}),
}))

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  submitting.value = true
  try {
    if (props.mode === 'create') {
      /* 创建需求：创建即立即上架（无草稿、无定时发布）；
       * 提交身份快照仅注册个人用户存在 */
      const identity =
        publisherType.value === 'individual'
          ? publisherUser.value?.identities[Number(identityIdx.value)] ?? null
          : null
      const demand = await createDemand({
        ...form,
        publisherId: publisherId.value,
        publisherName: publisherName.value,
        publisherType: publisherType.value,
        publisherIdentity: identity,
      })
      MessagePlugin.success(`需求已创建并发布（${demand.id}）`)
    } else if (props.demand) {
      await updateDemand(props.demand.id, { ...form })
      MessagePlugin.success('修改已保存')
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
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
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ confirmTextMap[mode] }}
        </t-button>
      </div>
    </template>
    <t-form ref="formRef" :data="{ ...form, publisherId: publisherId }" :rules="rules" label-align="top">
      <!-- create 模式：提交人（可创建新条目）与提交身份 -->
      <template v-if="mode === 'create'">
        <t-form-item label="提交人" name="publisherValue">
          <t-select
            v-model="publisherValue"
            :options="publisherOptions"
            filterable
            creatable
            placeholder="选择已注册的个人用户/企业，或直接输入新提交人"
            tips="未注册的提交人可直接输入名称创建；选中已注册企业/个人用户将自动填充联系方式"
          />
        </t-form-item>
        <t-form-item v-if="publisherType === 'individual'" label="提交身份" name="publisherIdentity">
          <t-select
            v-model="identityIdx"
            :options="identityOptions"
            placeholder="选择提交身份"
          />
        </t-form-item>
      </template>
      <t-form-item v-else label="提交人" name="publisherValue">
        <t-input :value="publisherName" disabled placeholder="提交人不可变更" />
      </t-form-item>

      <div class="form-row">
        <t-form-item label="联系电话" name="contactPhone">
          <t-input clearable v-model="form.contactPhone" placeholder="选已注册提交人后自动填充" />
        </t-form-item>
        <t-form-item label="联系邮箱" name="contactEmail">
          <t-input clearable v-model="form.contactEmail" placeholder="选填" />
        </t-form-item>
      </div>

      <t-form-item label="需求标题" name="title">
        <t-input clearable v-model="form.title" placeholder="请输入需求标题" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="类别" name="category">
          <t-select v-model="form.category" :options="categoryOptions" clearable />
        </t-form-item>
        <t-form-item label="预算" name="budget">
          <t-input clearable v-model="form.budget" placeholder="如 ¥10,000 - 30,000 / 面议" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="项目周期" name="period">
          <t-input clearable v-model="form.period" placeholder="如 4 周" />
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
