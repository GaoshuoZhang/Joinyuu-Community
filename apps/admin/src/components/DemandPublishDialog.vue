<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { createDemand, fetchPublisherOptions, updateDemand, type DemandPublishPayload } from '@/api/demands'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { fetchUser } from '@/api/users'
import { fetchPointsRules } from '@/api/mall'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { Demand, User, UserIdentity } from '@/types'

/* 需求弹窗（双模式共用）：
 * - create：后台直接创建需求，需求方可选已注册个人用户/企业（自动填充联系方式），
 *   或直接输入未注册需求方创建条目；创建即保存为「待发布」，由列表操作触发发布
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

/* 类别选项来自数据字典（M0-E 起统一取用），加载失败回退默认词表 */
const categoryOptions = ref(dictFallback.demand_category.map((c) => ({ label: c, value: c })))

const submitting = ref(false)
const formRef = ref()

/* create 模式：需求方（可创建新条目）与提交身份 */
const publisherUsers = ref<{ uid: string; nickname: string; realName: string; phone: string; email: string; tag: '社区个体' | '个人用户' }[]>([])
const publisherEnterprises = ref<{ id: string; name: string; contactName: string; contactPhone: string; contactEmail?: string; tag: '社区企业' | '外部企业' }[]>([])
const publisherId = ref('')
const publisherName = ref('')
const publisherType = ref<'individual' | 'enterprise' | 'custom'>('individual')
const publisherUser = ref<User | null>(null)

async function loadPublisherOptions() {
  try {
    const opts = await fetchPublisherOptions()
    publisherUsers.value = opts.users
    publisherEnterprises.value = opts.enterprises
    /* 选项就绪后重放当前选中值，确保联系方式填充不依赖触发时序 */
    if (form.publisherValue) applyPublisherContact(form.publisherValue)
  } catch {
    MessagePlugin.error('提交人选项加载失败')
  }
}

/* 选择需求方 → 解析类型并自动填充联系方式（未注册条目不填充）；
 * 注册个人用户 → 拉取身份列表供选择提交身份 */
/* 注：watch 须在 form 声明之后（getter 立即求值，置于 form 之前会 TDZ 报错：Cannot access 'form' before initialization） */

function applyPublisherContact(v: string) {
  publisherUser.value = null
  if (v.startsWith('E:')) {
    const e = publisherEnterprises.value.find((x) => 'E:' + x.id === v)
    if (!e) return
    publisherId.value = e.id
    publisherName.value = e.name
    publisherType.value = 'enterprise'
    /* 企业提交：联系人 = 企业联系人（企业整体决策场景） */
    form.contactName = e.contactName ?? e.name
    form.contactPhone = e.contactPhone
    form.contactEmail = e.contactEmail ?? ''
  } else if (v.startsWith('U:')) {
    const u = publisherUsers.value.find((x) => 'U:' + x.uid === v)
    if (!u) return
    publisherId.value = u.uid
    publisherName.value = u.nickname
    publisherType.value = 'individual'
    /* 个人提交：联系人 = 个人真实姓名 */
    form.contactName = u.realName ?? u.nickname
    form.contactPhone = u.phone
    form.contactEmail = u.email
    fetchUser(u.uid)
      .then((user) => {
        publisherUser.value = user
      })
      .catch(() => {
        publisherUser.value = null
      })
  } else if (v) {
    /* creatable 自建条目：值即名称 */
    publisherId.value = ''
    publisherName.value = v
    publisherType.value = 'custom'
    /* 非注册用户自建：联系人与联系方式均手填 */
    form.contactName = ''
    form.contactPhone = ''
    form.contactEmail = ''
  }
}

/* 提交人选项：全部企业 + 全部个人用户；配合 creatable 支持直接输入未注册提交人 */
const publisherOptions = computed(() => [
  ...publisherEnterprises.value.map((e) => ({ label: `${e.name}（${e.tag} · ${e.id}）`, value: `E:${e.id}` })),
  ...publisherUsers.value.map((u) => ({ label: `${u.nickname}（${u.tag} · ${u.uid}）`, value: `U:${u.uid}` })),
])


const form = reactive<DemandPublishPayload>({
  publisherValue: '',
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
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  respondPoints: 20,
})

/* 自定义开关：可见范围/可报名范围（关=不限）/ 响应需求奖励积分（关=按积分规则） */
const customVisibility = ref(false)
const customEnrollment = ref(false)
const customRespond = ref(false)

/* watch 在 form 声明之后注册：getter 立即求值 form.publisherValue，置于 form 之前会 TDZ 报错 */
watch(
  () => form.publisherValue,
  (v) => applyPublisherContact(v),
)

/* 选项加载放在 form 声明之后（避免引用 form 的时序隐患） */
loadPublisherOptions()

/* 积分规则默认分值：响应需求奖励 */
const rulePoints = reactive({ respond: 20 })

onMounted(async () => {
  try {
    const rules = await fetchPointsRules()
    rulePoints.respond = rules.find((r) => r.code === 'demand_responded')?.points ?? 20
  } catch {
    /* 规则加载失败时保留默认值 */
  }
  fetchDictEntries('demand_category')
    .then((entries) => {
      const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
      if (labels.length) categoryOptions.value = labels
    })
    .catch(() => {
      /* 字典加载失败保留回退词表 */
    })
})

/* 打开自定义奖励开关时，输入框默认填入积分规则设定值 */
watch(customRespond, (v) => {
  if (v) form.respondPoints = rulePoints.respond
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
      form.contactName = ''
      form.contactPhone = ''
      form.contactEmail = ''
      customVisibility.value = false
      customEnrollment.value = false
      customRespond.value = false
      form.respondPoints = rulePoints.respond
      form.publisherValue = ''
      publisherId.value = ''
      publisherName.value = ''
      publisherType.value = 'individual'
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
      customVisibility.value = props.demand.visibilityIdentities.length > 0 || props.demand.visibilityLevels.length > 0
      customEnrollment.value = props.demand.enrollmentIdentities.length > 0 || props.demand.enrollmentLevels.length > 0
      customRespond.value = props.demand.respondPoints != null
      form.respondPoints = props.demand.respondPoints ?? rulePoints.respond
      publisherId.value = props.demand.publisherId
      publisherName.value = props.demand.publisherName
      /* 需求方回填 → 三态自动填充联系人/联系方式 → 以保存记录为准（自定义与历史记录不丢） */
      form.publisherValue = props.demand.publisherId.startsWith('E')
        ? `E:${props.demand.publisherId}`
        : props.demand.publisherId.startsWith('U')
          ? `U:${props.demand.publisherId}`
          : props.demand.publisherName
      publisherType.value = props.demand.publisherId.startsWith('E')
        ? 'enterprise'
        : props.demand.publisherId.startsWith('U')
          ? 'individual'
          : 'custom'
      applyPublisherContact(form.publisherValue)
      if (props.demand.contactName != null) form.contactName = props.demand.contactName
      if (props.demand.contactPhone != null) form.contactPhone = props.demand.contactPhone
      if (props.demand.contactEmail != null) form.contactEmail = props.demand.contactEmail
      if (publisherType.value === 'individual') {
        try {
          const user = await fetchUser(props.demand.publisherId)
          publisherUser.value = user
        } catch {
          publisherUser.value = null
        }
      } else {
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
  contactName: [{ required: true, message: '请输入联系人', trigger: 'submit' }],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'submit' }],
}))

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  /* 联系人/联系方式仅在"选择需求方"时自动填充一次（@change/watch 触发）；
   * 确认保存不做重解析，保留用户手动修改的值 */
  if (!form.publisherValue.trim()) {
    MessagePlugin.warning('请选择或输入需求方')
    return
  }
  if (!publisherId.value && publisherType.value !== 'custom') {
    MessagePlugin.warning('请选择已注册的需求方或输入名称')
    return
  }
  submitting.value = true
  try {
    if (props.mode === 'create') {
      /* 创建需求：创建即保存为「待发布」（无草稿、无定时发布），由列表操作决定立即/定时发布；
       * 提交身份快照仅注册个人用户存在 */
      const identity =
        publisherType.value === 'individual'
          ? publisherUser.value?.identities[0] ?? null
          : null
      const demand = await createDemand({
        ...form,
        budget: form.budget.trim() || '面议',
        publisherId: publisherId.value,
        publisherName: publisherName.value,
        publisherType: publisherType.value,
        publisherIdentity: identity,
        visibilityIdentities: customVisibility.value ? form.visibilityIdentities : [],
        visibilityLevels: customVisibility.value ? form.visibilityLevels : [],
        enrollmentIdentities: customEnrollment.value ? form.enrollmentIdentities : [],
        enrollmentLevels: customEnrollment.value ? form.enrollmentLevels : [],
        respondPoints: customRespond.value ? form.respondPoints : undefined,
      })
      MessagePlugin.success(`需求已创建，进入待发布状态（${demand.id}）`)
    } else if (props.demand) {
      await updateDemand(props.demand.id, {
        ...form,
        budget: form.budget.trim() || '面议',
        visibilityIdentities: customVisibility.value ? form.visibilityIdentities : [],
        visibilityLevels: customVisibility.value ? form.visibilityLevels : [],
        enrollmentIdentities: customEnrollment.value ? form.enrollmentIdentities : [],
        enrollmentLevels: customEnrollment.value ? form.enrollmentLevels : [],
        respondPoints: customRespond.value ? form.respondPoints : undefined,
      })
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
        <t-form-item label="需求方" name="publisherValue">
          <t-select
            v-model="form.publisherValue"
            :options="publisherOptions"
            filterable
            creatable
            @change="(val: unknown) => applyPublisherContact(String(val ?? ''))"
            placeholder="选择已注册的个人用户/企业，或直接输入新需求方"
            tips="未注册的需求方可直接输入名称创建；选中已注册企业/个人用户将自动填充联系方式"
          />
        </t-form-item>
      </template>
      <t-form-item v-else label="需求方" name="publisherValue">
        <t-input :value="publisherName" disabled placeholder="提交人不可变更" />
      </t-form-item>

      <div class="form-row">
        <t-form-item label="联系人" name="contactName">
          <t-input clearable v-model="form.contactName" placeholder="企业提交自动填企业联系人" />
        </t-form-item>
        <t-form-item label="联系电话" name="contactPhone">
          <t-input clearable v-model="form.contactPhone" placeholder="选已注册需求方后自动填充" />
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
        <t-form-item label="预期交付截止日" name="period">
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
        <span class="scope-title">自定义可见范围</span>
        <t-switch v-model="customVisibility" />
      </div>
      <span class="scope-tip-block">默认关闭 = 所有身份、等级均可见；开启后可限定可见的身份与等级</span>
      <div v-if="customVisibility" class="form-row">
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
        <span class="scope-title">自定义可报名范围</span>
        <div class="scope-right">
          <t-switch v-model="customEnrollment" />
          <t-button v-if="customEnrollment && customVisibility" variant="text" size="small" @click="syncEnrollment">同步可见范围</t-button>
        </div>
      </div>
      <span class="scope-tip-block">默认关闭 = 所有身份、等级均可报名；开启后可限定可报名的身份与等级</span>
      <div v-if="customEnrollment" class="form-row">
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

      <div class="scope-head">
        <span class="scope-title">自定义响应需求奖励积分</span>
        <t-switch v-model="customRespond" />
      </div>
      <span class="scope-tip-block">默认关闭 = 按「积分规则」的响应需求奖励（{{ rulePoints.respond }} 积分）发放；开启后可按需求单独调整响应奖励</span>
      <t-form-item v-if="customRespond" label="响应需求奖励积分" name="respondPoints">
        <t-input-number v-model="form.respondPoints" :min="0" theme="column" style="width: 100%" />
      </t-form-item>

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

.scope-tip-block {
  display: block;
  margin: -6px 0 12px;
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
