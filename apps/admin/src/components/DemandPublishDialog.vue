<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import { createDemand, updateDemand, type DemandPublishPayload } from '@/api/demands'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { fetchPointsRules } from '@/api/mall'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import type { Demand } from '@/types'

const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

/* 需求弹窗（双模式共用）：
 * - create：后台直接新增需求。需求由社区自行创建，提交人与提交人身份由服务端按当前登录工作人员
 *   （账号名 + 姓名 + 角色名）派生，表单不再提供选择入口；新增即保存为「待发布」，由列表操作触发发布
 * - edit：待发布 / 已发布需求再编辑（不改状态、不改提交人）
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
  create: '新增需求',
  edit: '编辑需求',
} as const

const confirmTextMap = {
  create: '确认新增',
  edit: '保存',
} as const

/* 类别选项来自数据字典：表单持久化 code、界面显示 label。 */
const categoryOptions = ref(dictFallback.demand_category.map((c) => ({ label: c, value: c })))
const categoryCodeByLabel = ref<Record<string, string>>({})

const submitting = ref(false)
const formRef = ref()

/* 公开联系人开关（新增/编辑共用）：默认关闭，开启后客户端（含未登录游客）可见联系人信息 */

const form = reactive<DemandPublishPayload>({
  title: '',
  category: '',
  demandType: 'task',
  deliverable: '',
  deliverBy: '',
  cooperationNeed: '',
  returnOffer: '',
  bottleneck: '',
  partnershipMode: '',
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
  contactPublic: false,
  respondPoints: 20,
  respondNeedReview: true,
})

/* 未保存保护：打开时记录基线，关闭前有改动需确认 */
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(form)

/* 自定义开关：可见范围/可报名范围（关=不限） */
const customVisibility = ref(false)
const customEnrollment = ref(false)

/* 选项加载放在 form 声明之后（避免引用 form 的时序隐患），改为首次打开弹窗时按需加载（D-101） */

/* 积分规则默认分值：响应需求奖励 */
const rulePoints = reactive({ respond: 20 })

const optionsLoaded = ref(false)
let optionsPromise: Promise<void> | null = null
function ensureOptions(): Promise<void> {
  if (optionsLoaded.value) return Promise.resolve()
  if (!optionsPromise) {
    optionsPromise = Promise.all([
      fetchPointsRules()
        .then((rules) => {
          rulePoints.respond = rules.find((r) => r.code === 'demand_responded')?.points ?? 20
          if (props.visible && props.mode === 'create') form.respondPoints = rulePoints.respond
        })
        .catch(() => undefined),
      fetchDictEntries('demand_category')
        .then((entries) => {
          const enabled = entries.filter((e) => e.status === 'enabled')
          categoryCodeByLabel.value = Object.fromEntries(entries.map((entry) => [entry.label, entry.code]))
          const options = enabled.map((entry) => ({ label: entry.label, value: entry.code }))
          if (options.length) categoryOptions.value = options
          /* 字典晚于编辑抽屉加载时，也将历史标签值归一为 code。 */
          if (props.visible && props.demand && form.category === props.demand.category) {
            form.category = categoryCodeByLabel.value[props.demand.category] ?? props.demand.category
          }
        })
        .catch(() => {
          /* 字典加载失败保留回退词表 */
        }),
    ])
      .then(() => {
        optionsLoaded.value = true
      })
      .finally(() => {
        optionsPromise = null
      })
  }
  return optionsPromise
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    void ensureOptions()
    if (props.mode === 'create' || !props.demand) {
      form.title = ''
      form.category = ''
      form.demandType = 'task'
      form.deliverable = ''
      form.deliverBy = ''
      form.cooperationNeed = ''
      form.returnOffer = ''
      form.bottleneck = ''
      form.partnershipMode = ''
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
      form.contactPublic = false
      customVisibility.value = false
      customEnrollment.value = false
      form.respondPoints = rulePoints.respond
      form.respondNeedReview = true
    } else {
      form.title = props.demand.title
      /* 兼容旧数据直接存标签；再次保存时归一为当前字典 code。 */
      form.category = categoryCodeByLabel.value[props.demand.category] ?? props.demand.category
      form.demandType = props.demand.demandType ?? 'task'
      form.deliverable = props.demand.deliverable ?? ''
      form.deliverBy = props.demand.deliverBy ?? ''
      form.cooperationNeed = props.demand.cooperationNeed ?? ''
      form.returnOffer = props.demand.returnOffer ?? ''
      form.bottleneck = props.demand.bottleneck ?? ''
      form.partnershipMode = props.demand.partnershipMode ?? ''
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
      form.respondPoints = props.demand.respondPoints ?? rulePoints.respond
      form.respondNeedReview = props.demand.respondNeedReview !== false
      /* 提交人由服务端按工作人员派生，编辑不回填也不可改 */
      if (props.demand.contactName != null) form.contactName = props.demand.contactName
      if (props.demand.contactPhone != null) form.contactPhone = props.demand.contactPhone
      if (props.demand.contactEmail != null) form.contactEmail = props.demand.contactEmail
      form.contactPublic = props.demand.contactPublic === true
    }
    /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
    markBaseline()
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
  contactName: [{ required: true, message: '请输入联系人', trigger: 'submit' }],
  contactPhone: [{ required: true, message: '请输入联系电话', trigger: 'submit' }],
}))

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    if (props.mode === 'create') {
      /* 新增需求：新增即保存为「待发布」（无草稿、无定时发布），由列表操作决定立即/定时发布；
       * 提交人/提交人身份由服务端按当前登录工作人员派生，此处不传 */
      const demand = await createDemand({
        ...form,
        budget: form.budget.trim() || '面议',
        visibilityIdentities: customVisibility.value ? form.visibilityIdentities : [],
        visibilityLevels: customVisibility.value ? form.visibilityLevels : [],
        enrollmentIdentities: customEnrollment.value ? form.enrollmentIdentities : [],
        enrollmentLevels: customEnrollment.value ? form.enrollmentLevels : [],
        respondPoints: form.respondPoints,
      })
      MessagePlugin.success(`需求已新增，进入待发布状态（${demand.id}）`)
    } else if (props.demand) {
      await updateDemand(props.demand.id, {
        ...form,
        budget: form.budget.trim() || '面议',
        visibilityIdentities: customVisibility.value ? form.visibilityIdentities : [],
        visibilityLevels: customVisibility.value ? form.visibilityLevels : [],
        enrollmentIdentities: customEnrollment.value ? form.enrollmentIdentities : [],
        enrollmentLevels: customEnrollment.value ? form.enrollmentLevels : [],
        respondPoints: form.respondPoints,
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
  /* 未保存保护：有改动时弹确认（见 useDialogDirtyGuard） */
  guardClose(() => emit('update:visible', false))
}
usePageDirtyGuard(computed(() => props.visible && isDirty.value))
</script>

<template>
  <t-dialog
    lazy
    destroy-on-close
    :close-on-overlay-click="true"
    :visible="visible"
    :header="headerMap[mode]"
    width="880px"
    :close-on-esc-keydown="false"
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
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <div class="form-row form-row--3">
        <t-form-item label="联系人" name="contactName">
          <t-input v-accessible-field clearable v-model="form.contactName" placeholder="请输入联系人姓名…" />
        </t-form-item>
        <t-form-item label="联系电话" name="contactPhone">
          <t-input v-accessible-field clearable v-model="form.contactPhone" name="contact-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="请输入 11 位手机号…" />
        </t-form-item>
        <t-form-item label="联系邮箱" name="contactEmail">
          <t-input v-accessible-field clearable v-model="form.contactEmail" name="contact-email" inputmode="email" autocomplete="email" placeholder="选填…" />
        </t-form-item>
      </div>

      <!-- 公开联系人 / 响应需审核：两个开关并排（响应需审核紧跟公开联系人） -->
      <div class="form-row">
        <t-form-item name="contactPublic">
          <template #label>
            <t-popup content="开启后客户端（含未登录访客）可见该需求的联系人与联系电话；关闭则客户端一律不可见，后台始终可见" show-arrow>
              <span class="scope-popup-trigger">公开联系人</span>
            </t-popup>
          </template>
          <div class="contact-public-row">
            <t-switch v-accessible-field="'公开联系人'" v-model="form.contactPublic" aria-label="公开联系人" />
            <span class="scope-tip">{{ form.contactPublic ? '客户端可见联系人信息' : '客户端不可见联系人信息（默认）' }}</span>
          </div>
        </t-form-item>
        <t-form-item name="respondNeedReview">
          <template #label>
            <t-popup content="开启后，成员提交的响应需管理员审核通过才会对发布者可见；默认开启" show-arrow>
              <span class="scope-popup-trigger">响应需审核</span>
            </t-popup>
          </template>
          <div class="contact-public-row">
            <t-switch v-accessible-field="'响应需审核'" v-model="form.respondNeedReview" aria-label="响应需审核" />
            <span class="scope-tip">{{ form.respondNeedReview ? '需审核通过才对发布者可见（默认）' : '无需审核，直接对发布者可见' }}</span>
          </div>
        </t-form-item>
      </div>

      <t-form-item label="需求标题" name="title">
        <t-input v-accessible-field clearable v-model="form.title" placeholder="请输入需求标题…" />
      </t-form-item>
      <div class="form-row form-row--3">
        <t-form-item label="需求类型" name="demandType">
          <t-select v-accessible-field v-model="form.demandType" clearable :options="[
            { label: '找服务', value: 'task' },
            { label: '找投资', value: 'investment' },
            { label: '找合作', value: 'cooperation' },
          ]" />
        </t-form-item>
        <t-form-item label="类别" name="category">
          <t-select v-accessible-field v-model="form.category" :options="categoryOptions" clearable />
        </t-form-item>
        <t-form-item label="预算" name="budget">
          <t-input v-accessible-field clearable v-model="form.budget" placeholder="如 ¥10,000 - 30,000 / 面议…" />
        </t-form-item>
      </div>
      <div v-if="form.demandType === 'task'" class="form-row">
        <t-form-item label="预期交付内容" name="deliverable">
          <t-input v-accessible-field v-model="form.deliverable" clearable placeholder="说明期望获得的成果…" />
        </t-form-item>
        <t-form-item label="预期交付日期" name="deliverBy">
          <t-date-picker v-accessible-field v-model="form.deliverBy" valueType="YYYY-MM-DD" clearable class="ctl-w-full" />
        </t-form-item>
      </div>
      <div v-else-if="form.demandType === 'investment'" class="form-row">
        <t-form-item label="合作需求" name="cooperationNeed">
          <t-input v-accessible-field v-model="form.cooperationNeed" clearable placeholder="说明融资或资源合作需求…" />
        </t-form-item>
        <t-form-item label="可提供回报" name="returnOffer">
          <t-input v-accessible-field v-model="form.returnOffer" clearable placeholder="说明可提供的合作回报…" />
        </t-form-item>
      </div>
      <div v-else class="form-row">
        <t-form-item label="业务瓶颈" name="bottleneck">
          <t-input v-accessible-field v-model="form.bottleneck" clearable placeholder="说明当前需要解决的问题…" />
        </t-form-item>
        <t-form-item label="期望合作方式" name="partnershipMode">
          <t-input v-accessible-field v-model="form.partnershipMode" clearable placeholder="如联合研发、渠道合作…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="预期交付截止日" name="period">
          <t-date-picker
            v-accessible-field
            v-model="form.period"
            valueType="YYYY-MM-DD"
            clearable
            class="ctl-w-full"
            placeholder="请选择预期交付截止日…"
          />
        </t-form-item>
        <t-form-item label="报名截止时间" name="deadline">
          <t-date-picker
            v-accessible-field
            v-model="form.deadline"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            class="ctl-w-full"
          />
        </t-form-item>
      </div>

      <div class="form-row">
        <div class="scope-col">
          <div class="scope-head">
            <t-popup content="关闭 = 所有用户可见" show-arrow>
              <span class="scope-title scope-popup-trigger">自定义可见范围</span>
            </t-popup>
            <t-popup content="关闭 = 所有用户可见" show-arrow>
              <span class="scope-switch-trigger"><t-switch v-accessible-field="'自定义可见范围'" v-model="customVisibility" aria-label="自定义可见范围" /></span>
            </t-popup>
          </div>
          <t-form-item v-if="customVisibility" label="身份" name="visibilityIdentities">
            <t-select
              v-accessible-field
              v-model="form.visibilityIdentities"
              multiple
              clearable
              :options="visibilityIdentityOptions"
              placeholder="不限…"
            />
          </t-form-item>
          <t-form-item v-if="customVisibility" label="等级" name="visibilityLevels">
            <t-select v-accessible-field v-model="form.visibilityLevels" multiple clearable :options="userLevelOptions" placeholder="不限…" />
          </t-form-item>
        </div>
        <div class="scope-col">
          <div class="scope-head">
            <t-popup content="关闭 = 所有用户可报名" show-arrow>
              <span class="scope-title scope-popup-trigger">自定义可报名范围</span>
            </t-popup>
            <div class="scope-right">
              <t-button v-if="customEnrollment && customVisibility" variant="text" size="small" @click="syncEnrollment">同步可见范围</t-button>
              <t-popup content="关闭 = 所有用户可报名" show-arrow>
                <span class="scope-switch-trigger"><t-switch v-accessible-field="'自定义可报名范围'" v-model="customEnrollment" aria-label="自定义可报名范围" /></span>
              </t-popup>
            </div>
          </div>
          <t-form-item v-if="customEnrollment" label="身份" name="enrollmentIdentities">
            <t-select
              v-accessible-field
              v-model="form.enrollmentIdentities"
              multiple
              clearable
              :options="visibilityIdentityOptions"
              placeholder="不限…"
            />
          </t-form-item>
          <t-form-item v-if="customEnrollment" label="等级" name="enrollmentLevels">
            <t-select v-accessible-field v-model="form.enrollmentLevels" multiple clearable :options="userLevelOptions" placeholder="不限…" />
          </t-form-item>
        </div>
      </div>

      <t-form-item name="respondPoints">
        <template #label>
          <t-popup content="默认使用积分规则值，可直接为本需求调整响应奖励" show-arrow>
            <span class="scope-popup-trigger">响应奖励积分（规则值：{{ rulePoints.respond }}）</span>
          </t-popup>
        </template>
        <t-popup content="默认使用积分规则值，可直接为本需求调整响应奖励" show-arrow>
          <div class="reward-input-trigger">
            <t-input-number v-accessible-field="'响应奖励积分'" v-model="form.respondPoints" :min="0" theme="column" class="ctl-w-full" />
          </div>
        </t-popup>
      </t-form-item>

      <t-form-item label="需求内容" name="description">
        <RichEditor v-accessible-field v-model="form.description" placeholder="需求详细描述，支持图文排版…" :min-height="320" />
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

/* 三控件行（联系人/电话/邮箱、类型/类别/预算）：独立三列，避免第 3 个控件掉行错位 */
.form-row--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.scope-col {
  min-width: 0;
}

@media (max-width: 767px) {
  .form-row,
  .form-row--3 {
    grid-template-columns: 1fr;
  }
}

.scope-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  margin-bottom: 8px;
}

.scope-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-title {
  font-size: 14px;
  font-weight: 400;
  color: var(--td-text-color-primary);
}

.scope-popup-trigger {
  cursor: help;
}

.scope-switch-trigger {
  display: inline-flex;
}

.reward-input-trigger {
  width: 100%;
}

.contact-public-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.scope-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
