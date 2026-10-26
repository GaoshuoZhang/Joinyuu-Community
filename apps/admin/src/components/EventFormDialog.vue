<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import { useBrandingStore } from '@/stores/branding'
import { createEvent, updateEvent, type EventPayload } from '@/api/events'
import { fetchPointsRules } from '@/api/mall'
import { fetchSpaces } from '@/api/spaces'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { userLevelOptions, visibilityIdentityOptions } from '@/constants/identity'
import ImageUploadField from '@/components/ImageUploadField.vue'
import type { CommunityEvent } from '@/types'

const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

/* 活动新增/编辑弹窗：基本信息 + 报名截止时间
 * + 可见范围/等级 + 可报名范围/等级（默认与可见一致，可单独调整）+ 报名需审核
 * 新增无定时发布选项：新活动统一进入「待发布」，由列表操作决定立即发布/定时发布 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  event: CommunityEvent | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

/* 站点品牌：新建活动时「主办方」默认填站点名称（取自「系统配置 → 站点信息」） */
const branding = useBrandingStore()

/* 活动类型选项来自数据字典，加载失败回退默认词表 */
const typeOptions = ref(dictFallback.event_type.map((t) => ({ label: t, value: t })))

/* 地点下拉：可选空间（占用口径按空间名/地址匹配），也允许自行输入不在空间列表里的地点 */
const spaceOptions = ref<{ label: string; value: string; title: string }[]>([])

const submitting = ref(false)
const formRef = ref()
/* 活动标签：t-tag-input 标签数组（回车新增，可整体清空），与空间表单同一方案 */
const tags = ref<string[]>([])

const form = reactive({
  title: '',
  coverUrl: '',
  type: '沙龙',
  startTime: '',
  endTime: '',
  location: '',
  capacity: 30,
  speaker: '',
  host: '',
  description: '',
  enrollmentDeadline: '',
  visibilityIdentities: [] as string[],
  visibilityLevels: [] as string[],
  enrollmentIdentities: [] as string[],
  enrollmentLevels: [] as string[],
  requireReview: true,
  /* 报名要求绑定手机号/邮箱（默认关）：开启后未绑定用户报名时客户端提示并引导去绑定 */
  enrollRequirePhone: false,
  enrollRequireEmail: false,
  enrollPoints: 5,
  checkinPoints: 10,
  venueLat: '',
  venueLng: '',
  checkinRadiusM: 200,
  checkinOpenMin: 30,
  checkinCloseMin: 30,
  /* 签到校验位置（默认关）：开启后客户端签到做地理围栏校验 */
  checkinLocationRequired: false,
  /* 签到校验码（默认开）：留空保存由服务端自动生成 6 位数字 */
  checkinCodeRequired: true,
  checkinCode: '',
  cancelDeadlineHours: 24,
})

/* 未保存保护：打开时记录基线，关闭前有改动需确认 */
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(() => ({
  ...form, tags: tags.value, customVisibility: customVisibility.value, customEnrollment: customEnrollment.value,
}))

/* 积分规则默认分值：报名奖励 / 签到奖励 */
const rulePoints = reactive({ enroll: 5, checkin: 10 })

/* 范围开关：可见范围/可报名范围（关=不限，提交空数组） */
const customVisibility = ref(false)
const customEnrollment = ref(false)

/* 字典与积分规则默认值改为首次打开弹窗时按需加载：避免登录页/未打开时携带旧令牌请求（D-101） */
const optionLoadError = ref('')
const optionLoading = ref(false)
const optionsLoaded = ref(false)
let optionsPromise: Promise<void> | null = null
function ensureOptions(): Promise<void> {
  if (optionsLoaded.value) return Promise.resolve()
  if (!optionsPromise) {
    optionLoading.value = true
    optionsPromise = Promise.allSettled([
      fetchPointsRules()
        .then((rules) => {
          rulePoints.enroll = rules.find((r) => r.code === 'activity_enroll_approved')?.points ?? 5
          rulePoints.checkin = rules.find((r) => r.code === 'activity_checkin')?.points ?? 10
          if (props.visible && props.mode === 'create' && !isDirty.value) {
            form.enrollPoints = rulePoints.enroll
            form.checkinPoints = rulePoints.checkin
            markBaseline()
          }
        }),
      fetchDictEntries('event_type')
        .then((entries) => {
          const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
          typeOptions.value = labels
        }),
      fetchSpaces()
        .then((spaces) => {
          spaceOptions.value = spaces.map((s) => ({
            label: s.name,
            value: s.name,
            title: s.location ? `${s.name}（${s.location}）` : s.name,
          }))
        }),
    ])
      .then((results) => {
        const failures = results.filter((result) => result.status === 'rejected')
        optionsLoaded.value = failures.length === 0
        optionLoadError.value = failures.length ? '部分选项或奖励规则加载失败，请重试后核对。' : ''
      })
      .finally(() => {
        optionsPromise = null
        optionLoading.value = false
      })
  }
  return optionsPromise
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    void ensureOptions()
    if (props.mode === 'edit' && props.event) {
      form.title = props.event.title
      form.coverUrl = props.event.coverUrl ?? ''
      form.type = props.event.type
      form.startTime = props.event.startTime
      form.endTime = props.event.endTime
      form.location = props.event.location
      form.capacity = props.event.capacity
      form.speaker = props.event.speaker === '—' ? '' : props.event.speaker
      form.host = props.event.host
      form.description = props.event.description
      form.enrollmentDeadline = props.event.enrollmentDeadline ?? ''
      form.visibilityIdentities = [...props.event.visibilityIdentities]
      form.visibilityLevels = [...props.event.visibilityLevels]
      form.enrollmentIdentities = [...props.event.enrollmentIdentities]
      form.enrollmentLevels = [...props.event.enrollmentLevels]
      form.requireReview = props.event.requireReview
      form.enrollRequirePhone = props.event.enrollRequirePhone ?? false
      form.enrollRequireEmail = props.event.enrollRequireEmail ?? false
      form.enrollPoints = props.event.enrollPoints ?? rulePoints.enroll
      form.checkinPoints = props.event.checkinPoints ?? rulePoints.checkin
      form.venueLat = props.event.venueLat ?? ''
      form.venueLng = props.event.venueLng ?? ''
      form.checkinRadiusM = props.event.checkinRadiusM ?? 200
      form.checkinOpenMin = props.event.checkinOpenMin ?? 30
      form.checkinCloseMin = props.event.checkinCloseMin ?? 30
      form.checkinLocationRequired = props.event.checkinLocationRequired ?? false
      form.checkinCodeRequired = props.event.checkinCodeRequired ?? true
      form.checkinCode = props.event.checkinCode ?? ''
      form.cancelDeadlineHours = props.event.cancelDeadlineHours ?? 24
      customVisibility.value = props.event.visibilityIdentities.length > 0 || props.event.visibilityLevels.length > 0
      customEnrollment.value = props.event.enrollmentIdentities.length > 0 || props.event.enrollmentLevels.length > 0
      tags.value = [...props.event.tags]
    } else {
      form.title = ''
      form.coverUrl = ''
      form.type = '沙龙'
      form.startTime = ''
      form.endTime = ''
      form.location = ''
      form.capacity = 30
      form.speaker = ''
      form.host = branding.siteName
      form.description = ''
      form.enrollmentDeadline = ''
      form.visibilityIdentities = []
      form.visibilityLevels = []
      form.enrollmentIdentities = []
      form.enrollmentLevels = []
      form.requireReview = true
      form.enrollRequirePhone = false
      form.enrollRequireEmail = false
      form.enrollPoints = rulePoints.enroll
      form.checkinPoints = rulePoints.checkin
      form.venueLat = ''
      form.venueLng = ''
      form.checkinRadiusM = 200
      form.checkinOpenMin = 30
      form.checkinCloseMin = 30
      form.checkinLocationRequired = false
      form.checkinCodeRequired = true
      form.checkinCode = ''
      form.cancelDeadlineHours = 24
      customVisibility.value = false
      customEnrollment.value = false
      tags.value = []
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
 * DatePicker 时间面板交互会引发失焦导致提前红框；确认时 formRef.validate()
 * 默认 trigger='all' 会命中全部规则，此时才红框提示 */
const rules: FormProps['rules'] = {
  title: [{ required: true, message: '请输入活动标题', trigger: 'submit' }],
  type: [{ required: true, message: '请选择活动类型', trigger: 'submit' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'submit' }],
  endTime: [
    { required: true, message: '请选择结束时间', trigger: 'submit' },
    { validator: (value: string) => !form.startTime || value > form.startTime,
      message: '结束时间须晚于开始时间', trigger: 'submit' },
  ],
  enrollmentDeadline: [{ validator: (value: string) => !value || !form.startTime || value <= form.startTime,
    message: '报名截止时间不能晚于活动开始时间', trigger: 'submit' }],
  ...Object.fromEntries(['capacity', 'enrollPoints', 'checkinPoints', 'checkinRadiusM', 'checkinOpenMin', 'checkinCloseMin', 'cancelDeadlineHours']
    .map((key) => [key, [{ validator: (value: number) => Number.isInteger(value) && value >= (['capacity', 'checkinRadiusM'].includes(key) ? 1 : 0),
      message: ['capacity', 'checkinRadiusM'].includes(key) ? '请输入大于 0 的整数' : '请输入不小于 0 的整数', trigger: 'submit' as const }]])),
  /* 签到码：留空保存 = 服务端自动生成；填写须为 6 位数字 */
  checkinCode: [{ validator: (value: string) => !value || /^\d{6}$/.test(value),
    message: '签到码须为 6 位数字，留空保存时自动生成', trigger: 'submit' }],
  location: [{ required: true, message: '请输入地点', trigger: 'submit' }],
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    const payload: EventPayload = {
      title: form.title,
      coverUrl: form.coverUrl.trim() || undefined,
      type: form.type,
      startTime: form.startTime,
      endTime: form.endTime,
      location: form.location,
      capacity: form.capacity,
      speaker: form.speaker || '—',
      host: form.host,
      description: form.description,
      tags: [...tags.value],
      visibilityIdentities: customVisibility.value ? form.visibilityIdentities : [],
      visibilityLevels: customVisibility.value ? form.visibilityLevels : [],
      enrollmentIdentities: customEnrollment.value ? form.enrollmentIdentities : [],
      enrollmentLevels: customEnrollment.value ? form.enrollmentLevels : [],
      requireReview: form.requireReview,
      enrollRequirePhone: form.enrollRequirePhone,
      enrollRequireEmail: form.enrollRequireEmail,
      enrollmentDeadline: form.enrollmentDeadline || undefined,
      enrollPoints: form.enrollPoints,
      checkinPoints: form.checkinPoints,
      venueLat: form.venueLat || undefined,
      venueLng: form.venueLng || undefined,
      checkinRadiusM: form.checkinRadiusM,
      checkinOpenMin: form.checkinOpenMin,
      checkinCloseMin: form.checkinCloseMin,
      checkinLocationRequired: form.checkinLocationRequired,
      checkinCodeRequired: form.checkinCodeRequired,
      checkinCode: form.checkinCode.trim() || undefined,
      cancelDeadlineHours: form.cancelDeadlineHours,
    }
    if (props.mode === 'create') {
      const event = await createEvent(payload)
      MessagePlugin.success(`活动已新增，进入待发布状态（${event.id}）`)
    } else if (props.event) {
      await updateEvent(props.event.id, payload)
      MessagePlugin.success('活动修改已保存')
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
    :header="mode === 'create' ? '新增活动' : '编辑活动'"
    width="880px"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认新增' : '保存修改' }}
        </t-button>
      </div>
    </template>
    <t-alert v-if="optionLoadError" theme="warning" style="margin-bottom: 16px">
      {{ optionLoadError }}
      <t-button variant="text" theme="primary" size="small" :loading="optionLoading" @click="ensureOptions">重新加载</t-button>
    </t-alert>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="活动标题" name="title">
        <t-input v-accessible-field clearable v-model="form.title" placeholder="请输入活动标题…" />
      </t-form-item>
      <t-form-item label="活动封面" name="coverUrl" help="上传图片直传素材库；留空时移动端显示品牌占位图">
        <ImageUploadField v-model="form.coverUrl" biz-type="event-cover" tip="建议 16:9 横图，图片将存入素材库" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="活动类型" name="type">
          <t-select v-accessible-field clearable v-model="form.type" :options="typeOptions" />
        </t-form-item>
        <t-form-item label="容量" name="capacity">
          <t-input-number v-accessible-field v-model="form.capacity" :min="1" theme="column" class="ctl-w-full" :decimal-places="0" :step="1" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="开始时间" name="startTime">
          <t-date-picker
            v-accessible-field
            v-model="form.startTime"
            :disabled="mode === 'edit' && event?.status === 'published'"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            class="ctl-w-full"
          />
        </t-form-item>
        <t-form-item label="结束时间" name="endTime">
          <t-date-picker
            v-accessible-field
            v-model="form.endTime"
            :disabled="mode === 'edit' && event?.status === 'published'"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            class="ctl-w-full"
          />
        </t-form-item>
      </div>
      <t-alert v-if="mode === 'edit' && event?.status === 'published'" theme="info" message="已发布活动的起止时间请通过列表中的「改期」调整，系统会通知报名者。" style="margin-bottom: 16px" />
      <div class="form-row">
        <t-form-item label="报名截止时间" name="enrollmentDeadline">
          <t-date-picker
            v-accessible-field
            v-model="form.enrollmentDeadline"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            placeholder="留空 = 不限，活动开始前均可报名…"
            class="ctl-w-full"
          />
        </t-form-item>
        <t-form-item name="requireReview">
          <template #label>
            <t-popup content="开启后，用户报名需经管理员审核；关闭后报名自动通过" show-arrow>
              <span class="scope-popup-trigger">报名需审核</span>
            </t-popup>
          </template>
          <t-popup content="开启后，用户报名需经管理员审核；关闭后报名自动通过" show-arrow>
            <span class="scope-switch-trigger"><t-switch v-accessible-field="'报名需审核'" v-model="form.requireReview" aria-label="报名需审核" /></span>
          </t-popup>
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item name="enrollRequirePhone">
          <template #label>
            <t-popup content="开启后，用户报名时须已绑定手机号；未绑定时客户端会提示并引导去「账号与安全」完成绑定" show-arrow>
              <span class="scope-popup-trigger">报名需手机号</span>
            </t-popup>
          </template>
          <t-popup content="开启后，用户报名时须已绑定手机号；未绑定时客户端会提示并引导去「账号与安全」完成绑定" show-arrow>
            <span class="scope-switch-trigger"><t-switch v-accessible-field="'报名需手机号'" v-model="form.enrollRequirePhone" aria-label="报名需手机号" /></span>
          </t-popup>
        </t-form-item>
        <t-form-item name="enrollRequireEmail">
          <template #label>
            <t-popup content="开启后，用户报名时须已绑定邮箱；未绑定时客户端会提示并引导去「账号与安全」完成绑定" show-arrow>
              <span class="scope-popup-trigger">报名需邮箱</span>
            </t-popup>
          </template>
          <t-popup content="开启后，用户报名时须已绑定邮箱；未绑定时客户端会提示并引导去「账号与安全」完成绑定" show-arrow>
            <span class="scope-switch-trigger"><t-switch v-accessible-field="'报名需邮箱'" v-model="form.enrollRequireEmail" aria-label="报名需邮箱" /></span>
          </t-popup>
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="地点" name="location" help="选择空间后，该空间的可预约时段会自动避开本活动；其他地点可自行输入">
          <t-select
            v-accessible-field
            v-model="form.location"
            filterable
            creatable
            clearable
            :options="spaceOptions"
            placeholder="选择空间，或输入其他地点…"
          />
        </t-form-item>
        <t-form-item label="主办方" name="host">
          <t-input v-accessible-field clearable v-model="form.host" placeholder="如 聚屿社区…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="主讲嘉宾" name="speaker">
          <t-input v-accessible-field clearable v-model="form.speaker" placeholder="无则留空…" />
        </t-form-item>
        <t-form-item label="标签" name="tags">
          <t-tag-input v-model="tags" clearable placeholder="输入标签后回车新增…" />
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

      <div class="form-row">
        <div class="scope-col">
          <t-form-item class="reward-value" name="enrollPoints">
            <template #label>
              <t-popup content="默认使用积分规则值，可直接为本活动调整报名奖励" show-arrow>
                <span class="scope-popup-trigger">报名奖励积分（规则值：{{ rulePoints.enroll }}）</span>
              </t-popup>
            </template>
            <t-popup content="默认使用积分规则值，可直接为本活动调整报名奖励" show-arrow>
              <div class="reward-input-trigger">
                <t-input-number v-accessible-field="'报名奖励积分'" v-model="form.enrollPoints" :min="0" theme="column" class="ctl-w-full" :decimal-places="0" :step="1" />
              </div>
            </t-popup>
          </t-form-item>
        </div>
        <div class="scope-col">
          <t-form-item class="reward-value" name="checkinPoints">
            <template #label>
              <t-popup content="默认使用积分规则值，可直接为本活动调整签到奖励" show-arrow>
                <span class="scope-popup-trigger">签到奖励积分（规则值：{{ rulePoints.checkin }}）</span>
              </t-popup>
            </template>
            <t-popup content="默认使用积分规则值，可直接为本活动调整签到奖励" show-arrow>
              <div class="reward-input-trigger">
                <t-input-number v-accessible-field="'签到奖励积分'" v-model="form.checkinPoints" :min="0" theme="column" class="ctl-w-full" :decimal-places="0" :step="1" />
              </div>
            </t-popup>
          </t-form-item>
        </div>
      </div>

      <!-- 签到校验位置：开关默认关；开启后才显示 场地经度/场地纬度/签到半径（经度在纬度左边） -->
      <div class="form-row">
        <div class="scope-col">
          <div class="scope-head">
            <span class="scope-title scope-popup-trigger">签到校验位置</span>
            <span class="scope-switch-trigger"><t-switch v-accessible-field="'签到校验位置'" v-model="form.checkinLocationRequired" aria-label="签到校验位置" /></span>
          </div>
          <template v-if="form.checkinLocationRequired">
            <t-form-item label="场地经度" name="venueLng">
              <t-input v-accessible-field clearable v-model="form.venueLng" placeholder="如 120.1551；留空不校验位置…" />
            </t-form-item>
            <t-form-item label="场地纬度" name="venueLat">
              <t-input v-accessible-field clearable v-model="form.venueLat" placeholder="如 30.2741；留空不校验位置…" />
            </t-form-item>
            <t-form-item label="签到半径（米）" name="checkinRadiusM">
              <t-input-number v-accessible-field v-model="form.checkinRadiusM" :min="1" theme="column" class="ctl-w-full" :decimal-places="0" :step="1" />
            </t-form-item>
          </template>
        </div>
        <!-- 签到校验码：开关默认开；6 位数字留空保存由服务端自动生成 -->
        <div class="scope-col">
          <div class="scope-head">
            <span class="scope-title scope-popup-trigger">签到校验码</span>
            <span class="scope-switch-trigger"><t-switch v-accessible-field="'签到校验码'" v-model="form.checkinCodeRequired" aria-label="签到校验码" /></span>
          </div>
          <t-form-item v-if="form.checkinCodeRequired" label="签到码" name="checkinCode" help="参与者现场签到需输入 6 位签到码；留空保存由系统自动生成">
            <t-input v-accessible-field clearable v-model="form.checkinCode" maxlength="6" placeholder="留空保存自动生成…" />
          </t-form-item>
        </div>
      </div>

      <div class="form-row">
        <t-form-item label="取消报名时限（开场前小时）" name="cancelDeadlineHours">
          <t-input-number v-accessible-field v-model="form.cancelDeadlineHours" :min="0" theme="column" class="ctl-w-full" :decimal-places="0" :step="1" />
        </t-form-item>
        <t-form-item label="签到提前开放（分钟）" name="checkinOpenMin">
          <t-input-number v-accessible-field v-model="form.checkinOpenMin" :min="0" theme="column" class="ctl-w-full" :decimal-places="0" :step="1" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="签到延后关闭（分钟）" name="checkinCloseMin">
          <t-input-number v-accessible-field v-model="form.checkinCloseMin" :min="0" theme="column" class="ctl-w-full" :decimal-places="0" :step="1" />
        </t-form-item>
      </div>

      <t-form-item label="活动简介" name="description">
        <RichEditor v-accessible-field v-model="form.description" placeholder="活动详细说明，支持图文排版…" :min-height="320" />
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

.scope-col {
  min-width: 0;
}

@media (max-width: 767px) {
  .form-row {
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

.reward-value {
  margin-bottom: 0;
}

.reward-input-trigger {
  width: 100%;
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
</style>
