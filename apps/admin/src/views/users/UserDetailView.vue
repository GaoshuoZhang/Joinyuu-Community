<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab } from '@/utils/navigation'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import type { CustomValidateResolveType, FormProps } from 'tdesign-vue-next'
import { ArrowLeftIcon, BrowseIcon, BrowseOffIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import AdjustValueDialog from '@/components/AdjustValueDialog.vue'
import UserCardTab from '@/components/UserCardTab.vue'
import ImageUploadField from '@/components/ImageUploadField.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { identityTypeMap, roleLabelMap } from '@/constants/identity'
import { applicationTypeMap, normalizeUserGender, userGenderLabel, userGenderOptions } from '@/constants/status'
import {
  fetchUser,
  fetchUserRecords,
  freezeUser,
  resetUserPassword,
  updateUser,
  updateUserStatus,
  type UserApplicationRecord,
  type UserDemandRecord,
  type UserEventRecord,
  type UserFreezePayload,
  type UserLeaseRecord,
  type UserProfilePayload,
  type UserProjectRecord,
  type UserReservationRecord,
  type UserRecords,
  type UserSubmissionRecord,
} from '@/api/users'
import { fetchExternalEnterprises } from '@/api/external-enterprises'
import { isNotFound } from '@/api/http'
import { adjustExperience, adjustPoints, fetchExperienceRecords, fetchPointsRecords } from '@/api/ledgers'
import { deriveReservationStatus } from '@/utils/reservation'
import { focusFirstInvalid, useDialogDirtyGuard } from '@/utils/form'
import type { ExperienceRecord, PointsRecord, User, UserIdentity, ExternalEnterprise } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const user = ref<User | null>(null)
const sensitiveVisible = ref(false)
/** 合作企业档案缓存：external_enterprise 身份经"档案名 + 成员 uid"反查档案 ID */
const externalArchives = ref<ExternalEnterprise[]>([])
const activeTab = useQueryTab('identities', ['identities', 'card', 'applications', 'demands', 'projects', 'events', 'leases', 'submissions', 'reservations', 'experience', 'points', 'activities'] as const)

function maskCitizenId(value?: string | null): string {
  if (!value) return '—'
  if (value.length <= 8) return `${value.slice(0, 2)}****${value.slice(-2)}`
  return `${value.slice(0, 6)}********${value.slice(-4)}`
}

function maskPhone(value?: string | null): string {
  if (!value) return '—'
  if (value.length < 8) return `${value.slice(0, 2)}****${value.slice(-2)}`
  return `${value.slice(0, 3)}****${value.slice(7)}`
}

function maskEmail(value?: string | null): string {
  if (!value) return '—'
  const at = value.indexOf('@')
  if (at <= 0) return `${value.slice(0, 2)}***`
  const local = value.slice(0, at)
  return `${local.slice(0, Math.min(2, local.length))}***${value.slice(at)}`
}

function maskOpaqueId(value?: string | null): string {
  if (!value) return '—'
  if (value.length <= 10) return `${value.slice(0, 2)}…${value.slice(-2)}`
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

/* 头部身份标签行：个人用户为默认身份，不展示 */
const headerIdentities = computed(() => user.value?.identities.filter((i) => i.type !== 'individual') ?? [])

function identityName(identity: UserIdentity): string {
  if (identity.type === 'community_individual') return '社区个体'
  return identity.enterpriseName ?? '—'
}

/* 个人用户为注册默认身份，身份信息中不单独展示 */
const displayIdentities = computed(() => user.value?.identities.filter((i) => i.type !== 'individual') ?? [])

/* 社区个体身份（至多一个）；经验值选项卡仅对持有该身份的用户展示 */
const communityIndividualIdentity = computed(() =>
  user.value?.identities.find((i) => i.type === 'community_individual'),
)

/* 社区企业身份卡可跳社区企业详情；合作企业身份卡可跳合作企业详情（档案名 + 成员 uid 反查） */
function externalArchiveId(identity: UserIdentity): string | undefined {
  if (identity.type !== 'external_enterprise') return undefined
  const uid = user.value?.uid
  return externalArchives.value.find(
    (a) => a.name === identity.enterpriseName && a.members.some((m) => m.userId === uid),
  )?.id
}

function canGoEnterprise(identity: UserIdentity): boolean {
  if (identity.type === 'community_enterprise') return !!identity.enterpriseId
  return identity.type === 'external_enterprise' && !!externalArchiveId(identity)
}


/* ---------- 账号编辑 / 冻结 / 恢复 ---------- */

const editVisible = ref(false)
const editSaving = ref(false)
const editFormRef = ref()
const editForm = reactive({
  username: '',
  nickname: '',
  phone: '',
  email: '',
  gender: 'male' as 'male' | 'female' | 'unknown',
  realName: '',
  citizenId: '',
  bio: '',
  /* 头像地址（素材上传回填）：空串 = 清除头像 */
  avatar: '',
})
/* 编辑弹窗中处于遮罩占位的值：与表单当前值一致时视为「未修改」，提交时回填原值而非写入遮罩文本 */
const editMaskedPhone = ref('')
const editMaskedCitizenId = ref('')
/* 未保存保护：有改动时关闭需确认（见 useDialogDirtyGuard） */
const { markBaseline: markEditBaseline, guardClose: guardEditClose } = useDialogDirtyGuard(editForm)

const editRules: FormProps['rules'] = {
  username: [
    { required: true, message: '请填写用户名', trigger: 'submit' },
    {
      pattern: /^[A-Za-z][A-Za-z0-9_]{3,19}$/,
      message: '用户名需以字母开头，4-20 位，仅可包含字母、数字与下划线',
      trigger: 'submit',
    },
  ],
  nickname: [{ required: true, message: '请填写昵称', trigger: 'submit' }],
}

function openEdit() {
  if (!user.value) return
  editForm.username = user.value.username
  editForm.nickname = user.value.nickname
  /* 未显式「显示敏感信息」时以遮罩占位回填，避免明文出现在弹窗（提交时未修改则回填原值） */
  editMaskedPhone.value = !sensitiveVisible.value && user.value.phone ? maskPhone(user.value.phone) : ''
  editForm.phone = editMaskedPhone.value || (user.value.phone ?? '')
  editForm.email = user.value.email
  /* 历史中文值（男/女）在打开表单时归一为客户端规范值，保存后统一写入 male/female/unknown */
  editForm.gender = normalizeUserGender(user.value.gender)
  editForm.realName = user.value.realName ?? ''
  editMaskedCitizenId.value = !sensitiveVisible.value && user.value.citizenId
    ? maskCitizenId(user.value.citizenId)
    : ''
  editForm.citizenId = editMaskedCitizenId.value || (user.value.citizenId ?? '')
  editForm.bio = user.value.bio
  editForm.avatar = user.value.avatar ?? ''
  markEditBaseline()
  editVisible.value = true
  nextTick(() => editFormRef.value?.clearValidate())
}

/* 关闭统一入口：footer 取消 / X / Esc 均经 dirty guard 判断 */
function closeEdit() {
  guardEditClose(() => (editVisible.value = false))
}

async function onConfirmEdit() {
  const valid = await editFormRef.value.validate()
  if (valid !== true) { focusFirstInvalid(editFormRef.value); return }
  if (!user.value) return
  editSaving.value = true
  try {
    /* 遮罩占位未被修改（值与占位一致）时回填原值，避免把「138****0000」写入库 */
    const phone =
      editMaskedPhone.value && editForm.phone === editMaskedPhone.value
        ? (user.value.phone ?? '')
        : editForm.phone
    const citizenId =
      editMaskedCitizenId.value && editForm.citizenId === editMaskedCitizenId.value
        ? (user.value.citizenId ?? '')
        : editForm.citizenId
    const payload: UserProfilePayload = {
      username: editForm.username.trim(),
      nickname: editForm.nickname,
      phone,
      email: editForm.email,
      gender: editForm.gender,
      realName: editForm.realName,
      citizenId,
      bio: editForm.bio,
      avatar: editForm.avatar,
    }
    await updateUser(user.value.uid, payload)
    MessagePlugin.success('用户资料已更新')
    editVisible.value = false
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    editSaving.value = false
  }
}

const freezeVisible = ref(false)
const freezeSaving = ref(false)
const freezeFormRef = ref()
const freezeForm = reactive({
  permanent: false,
  until: '',
  reason: '',
})

const freezeRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写冻结原因', trigger: 'submit' }],
  until: [{ required: true, message: '请选择冻结期限或开启长期冻结', trigger: 'submit' }],
}

/* 未保存保护：有改动时关闭需确认（见 useDialogDirtyGuard） */
const { markBaseline: markFreezeBaseline, guardClose: guardFreezeClose } = useDialogDirtyGuard(freezeForm)

/* 长期开关：开启后清空冻结期限（期限项随之隐藏） */
watch(
  () => freezeForm.permanent,
  (v) => {
    if (v) freezeForm.until = ''
  },
)

function openFreeze() {
  freezeForm.permanent = false
  freezeForm.until = ''
  freezeForm.reason = ''
  markFreezeBaseline()
  freezeVisible.value = true
  nextTick(() => freezeFormRef.value?.clearValidate())
}

/* 关闭统一入口：footer 取消 / X / Esc 均经 dirty guard 判断 */
function closeFreeze() {
  guardFreezeClose(() => (freezeVisible.value = false))
}

async function onConfirmFreeze() {
  if (!user.value) return
  const valid = await freezeFormRef.value.validate()
  if (valid !== true) { focusFirstInvalid(freezeFormRef.value); return }
  freezeSaving.value = true
  try {
    const payload: UserFreezePayload = {
      permanent: freezeForm.permanent,
      until: freezeForm.permanent ? undefined : freezeForm.until,
      reason: freezeForm.reason.trim(),
    }
    await freezeUser(user.value.uid, payload)
    MessagePlugin.success(
      payload.permanent
        ? `已长期冻结账号「${user.value.nickname}」`
        : `已冻结账号「${user.value.nickname}」至 ${payload.until}`,
    )
    freezeVisible.value = false
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '冻结失败')
  } finally {
    freezeSaving.value = false
  }
}

/* 恢复：确认后直接执行并清理冻结信息 */
const restoring = ref(false)

async function onRestore() {
  if (!user.value) return
  restoring.value = true
  try {
    await updateUserStatus(user.value.uid, 'active')
    MessagePlugin.success(`已恢复账号「${user.value.nickname}」`)
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    restoring.value = false
  }
}

/* ---------- 重置密码（强制覆盖当前登录密码） ---------- */

const resetPwdVisible = ref(false)
const resetPwdSaving = ref(false)
const resetPwdFormRef = ref()
const resetPwdForm = reactive({ password: '', confirmPassword: '' })

/* 未保存保护：有改动时关闭需确认（见 useDialogDirtyGuard） */
const { markBaseline: markResetPwdBaseline, guardClose: guardResetPwdClose } = useDialogDirtyGuard(resetPwdForm)

/* 确认密码一致性校验（TDesign 自定义校验器第二参只有 { formData, name }，字段值须从 formData 读取） */
function validateConfirmPassword(
  _value: unknown,
  params?: { formData: Record<string, unknown>; name: string },
): CustomValidateResolveType {
  if (params?.formData?.confirmPassword !== params?.formData?.password) {
    return { result: false, message: '两次输入的密码不一致' }
  }
  return true
}

const resetPwdRules: FormProps['rules'] = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'submit' },
    { min: 8, message: '密码至少 8 位', trigger: 'submit' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '密码需同时包含字母和数字', trigger: 'submit' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'submit' },
    { validator: validateConfirmPassword, trigger: 'submit' },
  ],
}

function openResetPwd() {
  resetPwdForm.password = ''
  resetPwdForm.confirmPassword = ''
  markResetPwdBaseline()
  resetPwdVisible.value = true
  nextTick(() => resetPwdFormRef.value?.clearValidate())
}

/* 关闭统一入口：footer 取消 / X / Esc 均经 dirty guard 判断 */
function closeResetPwd() {
  guardResetPwdClose(() => (resetPwdVisible.value = false))
}

async function submitResetPassword(uid: string) {
  resetPwdSaving.value = true
  try {
    await resetUserPassword(uid, resetPwdForm.password)
    MessagePlugin.success('密码已重置')
    resetPwdVisible.value = false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '重置失败')
  } finally {
    resetPwdSaving.value = false
  }
}

async function onConfirmResetPwd() {
  const current = user.value
  if (!current) return
  const valid = await resetPwdFormRef.value.validate()
  if (valid !== true) { focusFirstInvalid(resetPwdFormRef.value); return }
  /* 二次确认：确认后才真正覆盖密码（确认弹窗关闭后由外层弹窗展示提交态） */
  const confirmDialog = DialogPlugin.confirm({
    header: '确认重置密码',
    body: `将强制覆盖用户「${current.nickname}」的当前登录密码，此操作不可撤销。确认继续？`,
    theme: 'warning',
    confirmBtn: { content: '确认重置', theme: 'danger' },
    onConfirm: () => {
      confirmDialog.destroy()
      void submitResetPassword(current.uid)
    },
  })
}

/* ---------- 经验值 / 积分流水 ---------- */

const experienceRecords = ref<ExperienceRecord[]>([])
const pointsRecords = ref<PointsRecord[]>([])

const expAdjustVisible = ref(false)
const expAdjusting = ref(false)
const pointsAdjustVisible = ref(false)
const pointsAdjusting = ref(false)

const ledgerColumns = [
  { colKey: 'at', title: '时间', width: 170 , ellipsis: true},
  { colKey: 'delta', title: '变动', cell: 'delta', width: 90 , ellipsis: true},
  { colKey: 'balance', title: '余额', width: 90 , ellipsis: true},
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'operator', title: '操作人', width: 100 , ellipsis: true},
]

/* ---------- 用户记录（申请 / 需求 / 项目 / 活动 / 租赁 / 投稿 / 预约） ---------- */

const records = ref<UserRecords | null>(null)
const recordsLoading = ref(false)
/* 记录加载失败：与空态区分展示，提供重试入口（避免失败被静默伪装成「暂无记录」） */
const recordsError = ref('')

/* 历史（终态）状态集合：条目落入终态或已归档（deletedAt 非空）即归入「历史记录」段，其余为进行中的当前记录 */
const APPLICATION_HISTORY = new Set(['approved', 'rejected'])
const DEMAND_HISTORY = new Set(['rejected', 'closed', 'projected'])
const PROJECT_HISTORY = new Set(['finished', 'closed'])
const EVENT_HISTORY = new Set(['ended', 'cancelled'])
const LEASE_HISTORY = new Set(['terminated'])
const SUBMISSION_HISTORY = new Set(['pending_release', 'rejected'])
const RESERVATION_HISTORY = new Set(['ended', 'rejected', 'cancelled'])

const isApplicationHistory = (row: UserApplicationRecord) => APPLICATION_HISTORY.has(row.status)
const isDemandHistory = (row: UserDemandRecord) => DEMAND_HISTORY.has(row.status)
const isProjectHistory = (row: UserProjectRecord) => PROJECT_HISTORY.has(row.status)
const isEventHistory = (row: UserEventRecord) => EVENT_HISTORY.has(row.status)
const isLeaseHistory = (row: UserLeaseRecord) => LEASE_HISTORY.has(row.status)
const isSubmissionHistory = (row: UserSubmissionRecord) => SUBMISSION_HISTORY.has(row.status)
const isReservationHistory = (row: UserReservationRecord) =>
  RESERVATION_HISTORY.has(deriveReservationStatus(row))

/* 已归档条目（deletedAt 非空）一律归入「历史记录」段 */
function isArchived(row: { deletedAt: string | null }): boolean {
  return !!row.deletedAt
}

function currentOf<T extends { deletedAt: string | null }>(
  list: T[] | undefined,
  isHistory: (row: T) => boolean,
): T[] {
  return (list ?? []).filter((row) => !isArchived(row) && !isHistory(row))
}

function historyOf<T extends { deletedAt: string | null }>(
  list: T[] | undefined,
  isHistory: (row: T) => boolean,
): T[] {
  return (list ?? []).filter((row) => isArchived(row) || isHistory(row))
}

const currentApplications = computed(() => currentOf(records.value?.applications, isApplicationHistory))
const historyApplications = computed(() => historyOf(records.value?.applications, isApplicationHistory))
const currentDemands = computed(() => currentOf(records.value?.demands, isDemandHistory))
const historyDemands = computed(() => historyOf(records.value?.demands, isDemandHistory))
const currentProjects = computed(() => currentOf(records.value?.projects, isProjectHistory))
const historyProjects = computed(() => historyOf(records.value?.projects, isProjectHistory))
const currentEvents = computed(() => currentOf(records.value?.events, isEventHistory))
const historyEvents = computed(() => historyOf(records.value?.events, isEventHistory))
const currentLeases = computed(() => currentOf(records.value?.leases, isLeaseHistory))
const historyLeases = computed(() => historyOf(records.value?.leases, isLeaseHistory))
const currentSubmissions = computed(() => currentOf(records.value?.submissions, isSubmissionHistory))
const historySubmissions = computed(() => historyOf(records.value?.submissions, isSubmissionHistory))
const currentReservations = computed(() => currentOf(records.value?.reservations, isReservationHistory))
const historyReservations = computed(() => historyOf(records.value?.reservations, isReservationHistory))

const applicationColumns = [
  { colKey: 'id', title: '申请编号', width: 110, ellipsis: true },
  { colKey: 'type', title: '申请类型', width: 110, cell: 'appType' },
  { colKey: 'targetName', title: '申请对象', ellipsis: true },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'submittedAt', title: '提交时间', width: 170, ellipsis: true },
]

const demandColumns = [
  { colKey: 'id', title: '需求编号', width: 110, ellipsis: true },
  { colKey: 'title', title: '需求标题', ellipsis: true },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'createdAt', title: '创建时间', width: 170, ellipsis: true },
  /* 行点击仅有鼠标路径，操作列「详情」为键盘/读屏用户提供同等入口（H-01） */
  { colKey: 'op', title: '操作', width: 80, cell: 'op-demand' },
]

const projectColumns = [
  { colKey: 'id', title: '项目编号', width: 110, ellipsis: true },
  { colKey: 'name', title: '项目名称', ellipsis: true },
  { colKey: 'code', title: '项目代号', width: 120, ellipsis: true },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'initiatedAt', title: '立项时间', width: 170, ellipsis: true },
  /* 行点击仅有鼠标路径，操作列「详情」为键盘/读屏用户提供同等入口（H-01） */
  { colKey: 'op', title: '操作', width: 80, cell: 'op-project' },
]

const eventColumns = [
  { colKey: 'id', title: '活动编号', width: 110, ellipsis: true },
  { colKey: 'title', title: '活动标题', ellipsis: true },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'time', title: '活动时间', width: 320, cell: 'time' },
  /* 行点击仅有鼠标路径，操作列「详情」为键盘/读屏用户提供同等入口（H-01） */
  { colKey: 'op', title: '操作', width: 80, cell: 'op-event' },
]

const recordLeaseColumns = [
  { colKey: 'id', title: '租约编号', width: 110, ellipsis: true },
  { colKey: 'renterName', title: '租赁方', ellipsis: true },
  { colKey: 'term', title: '租期', width: 220, cell: 'term' },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'terminatedAt', title: '终止时间', width: 170, ellipsis: true, cell: 'terminatedAt' },
  /* 行点击仅有鼠标路径，操作列「详情」为键盘/读屏用户提供同等入口（H-01） */
  { colKey: 'op', title: '操作', width: 80, cell: 'op-lease' },
]

const submissionColumns = [
  { colKey: 'id', title: '投稿编号', width: 110, ellipsis: true },
  { colKey: 'title', title: '稿件标题', ellipsis: true },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
  { colKey: 'createdAt', title: '投稿时间', width: 170, ellipsis: true },
]

const reservationColumns = [
  { colKey: 'id', title: '预约编号', width: 110, ellipsis: true },
  { colKey: 'spaceName', title: '空间名称', ellipsis: true },
  { colKey: 'date', title: '预约日期', width: 170 },
  { colKey: 'time', title: '使用时段', width: 220, cell: 'time' },
  { colKey: 'status', title: '状态', width: 100, cell: 'status' },
]

function eventTime(row: UserEventRecord): string {
  return `${row.startTime} ~ ${row.endTime}`
}

function recordLeaseTerm(row: UserLeaseRecord): string {
  return row.longTerm ? `${row.startDate} ~ 长期` : `${row.startDate} ~ ${row.endDate}`
}

function reservationTime(row: UserReservationRecord): string {
  return `${row.startTime} ~ ${row.endTime}`
}

function reservationStatus(row: UserReservationRecord): string {
  return deriveReservationStatus(row)
}

/* 行点击跳转（仅存在详情页的记录域） */
function goDemandRecord(row: UserDemandRecord) {
  router.push(`/demands/${row.id}`)
}

function goProjectRecord(row: UserProjectRecord) {
  router.push(`/projects/${row.id}`)
}

function goEventRecord(row: UserEventRecord) {
  router.push(`/events/${row.id}`)
}

function goLeaseRecord(row: UserLeaseRecord) {
  router.push(`/workstations/leases/${row.id}`)
}

async function loadRecords() {
  recordsLoading.value = true
  recordsError.value = ''
  try {
    records.value = await fetchUserRecords(route.params.id as string)
  } catch (e) {
    records.value = null
    recordsError.value = e instanceof Error ? e.message : '记录加载失败'
  } finally {
    recordsLoading.value = false
  }
}

async function onAdjustExperience(delta: number, reason: string) {
  if (!user.value) return
  expAdjusting.value = true
  try {
    const res = await adjustExperience('individual', user.value.uid, delta, reason)
    MessagePlugin.success(`已${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 经验值，当前余额 ${res.balance}`)
    expAdjustVisible.value = false
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '调整失败')
  } finally {
    expAdjusting.value = false
  }
}

async function onAdjustPoints(delta: number, reason: string) {
  if (!user.value) return
  pointsAdjusting.value = true
  try {
    const res = await adjustPoints(user.value.uid, delta, reason)
    MessagePlugin.success(`已${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 积分，当前余额 ${res.balance}`)
    pointsAdjustVisible.value = false
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '调整失败')
  } finally {
    pointsAdjusting.value = false
  }
}

async function loadDetail() {
  const id = route.params.id as string
  const [u, archives] = await Promise.all([
    fetchUser(id),
    fetchExternalEnterprises({ page: 1, pageSize: 100 }),
  ])
  user.value = u
  externalArchives.value = archives.list
  if (user.value.identities.some((i) => i.type === 'community_individual')) {
    experienceRecords.value = await fetchExperienceRecords('individual', id)
  }
  pointsRecords.value = await fetchPointsRecords(id)
}

/* 详情加载：404 走「不存在」空态，其余错误保留原因并展示重试入口 */
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    await loadDetail()
    loadRecords()
  } catch (e) {
    if (isNotFound(e)) {
      user.value = null
    } else {
      loadError.value = e instanceof Error ? e.message : '用户加载失败'
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="user-detail page-fade-in">
    <t-button variant="text" theme="default" class="back-btn" @click="router.back()">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '208px' }, { width: '100%', height: '400px' }]"
      animation="gradient"
    />

    <ListErrorState v-else-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <t-empty v-else-if="!user" description="用户不存在或已被删除">
      <!-- 直达 URL 时 router.back() 可能离开系统，空态提供明确的下一步（L-01） -->
      <template #action>
        <t-button @click="router.push('/users')">返回用户列表</t-button>
      </template>
    </t-empty>

    <template v-else>
      <!-- 用户信息头卡片 -->
      <div class="page-card profile-card">
        <div class="profile-head">
          <t-avatar size="56px" :image="user.avatar">{{ user.nickname.slice(0, 1) }}</t-avatar>
          <div class="profile-title">
            <div class="profile-name-row">
              <span class="profile-name">{{ user.nickname }}</span>
              <StatusTag entity="user" :value="user.status" />
            </div>
            <span class="profile-id">用户名: <t-tag class="id-tag" size="small" variant="light">{{ user.username }}</t-tag></span>
            <span class="profile-id">用户ID: <t-tag class="id-tag" size="small" variant="light">{{ user.uid }}</t-tag></span>
            <IdentityTags v-if="headerIdentities.length" :identities="headerIdentities" :show-id="false" />
          </div>
          <div class="profile-actions">
            <t-button variant="text" :title="sensitiveVisible ? '隐藏敏感信息' : '显示敏感信息'" @click="sensitiveVisible = !sensitiveVisible">
              <template #icon><BrowseOffIcon v-if="sensitiveVisible" /><BrowseIcon v-else /></template>
              {{ sensitiveVisible ? '隐藏敏感信息' : '显示敏感信息' }}
            </t-button>
            <template v-if="user.status !== 'deleted'">
              <t-button theme="primary" variant="outline" @click="openEdit">编辑</t-button>
              <t-button variant="outline" @click="openResetPwd">重置密码</t-button>
              <t-popconfirm
                v-if="user.status === 'frozen'"
                content="确认恢复该账号？恢复后冻结信息将被清除"
                confirm-btn="恢复"
                @confirm="onRestore"
              >
                <t-button :loading="restoring">恢复</t-button>
              </t-popconfirm>
              <t-button v-else theme="danger" @click="openFreeze">冻结</t-button>
            </template>
          </div>
        </div>

        <t-descriptions :column="2" bordered class="profile-desc">
          <t-descriptions-item label="联系电话">
            <span class="channel-value">
              {{ sensitiveVisible ? (user.phone || '—') : maskPhone(user.phone) }}
              <StatusTag entity="contactVerified" :value="user.phoneVerified ? 'verified' : 'unverified'" size="small" />
            </span>
          </t-descriptions-item>
          <t-descriptions-item label="邮箱">
            <span class="channel-value">
              {{ sensitiveVisible ? (user.email || '—') : maskEmail(user.email) }}
              <StatusTag entity="contactVerified" :value="user.emailVerified ? 'verified' : 'unverified'" size="small" />
            </span>
          </t-descriptions-item>
          <t-descriptions-item label="性别">{{ userGenderLabel(user.gender) }}</t-descriptions-item>
          <t-descriptions-item label="实名状态">
            <StatusTag entity="verified" :value="user.realName && user.citizenId ? 'verified' : 'unverified'" size="small" />
          </t-descriptions-item>
          <t-descriptions-item label="真实姓名">{{ user.realName ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="身份证号">{{ sensitiveVisible ? (user.citizenId ?? '—') : maskCitizenId(user.citizenId) }}</t-descriptions-item>
          <t-descriptions-item label="微信绑定">
            {{ user.wechatOpenid ? (user.wechatVerified ? '已绑定 · 已微信实名' : '已绑定 · 未微信实名') : '未绑定' }}
          </t-descriptions-item>
          <t-descriptions-item label="微信 OpenID">{{ maskOpaqueId(user.wechatOpenid) }}</t-descriptions-item>
          <t-descriptions-item label="微信 UnionID">{{ maskOpaqueId(user.wechatUnionid) }}</t-descriptions-item>
          <t-descriptions-item v-if="user.status === 'frozen'" label="冻结信息" :span="2">
            {{ user.frozenUntil ? `冻结至 ${user.frozenUntil}` : '长期冻结' }} · 原因：{{ user.frozenReason ?? '—' }}
          </t-descriptions-item>
          <t-descriptions-item label="积分（个人用户）">{{ user.points }}</t-descriptions-item>
          <t-descriptions-item label="注册时间">{{ user.registeredAt }}</t-descriptions-item>
          <t-descriptions-item label="最后活跃时间">{{ user.lastActiveAt }}</t-descriptions-item>
        </t-descriptions>

        <p class="profile-bio">{{ user.bio || '—' }}</p>
      </div>

      <!-- 身份信息 / 记录 / 经验值 / 积分 / 活跃记录 -->
      <div class="page-card">
        <t-tabs v-model="activeTab">
          <t-tab-panel value="identities" label="身份信息">
            <div class="tab-body">
              <t-empty
                v-if="displayIdentities.length === 0"
                description="该用户仅持有默认的个人用户身份"
              />
              <div v-else class="identity-list">
                <t-link theme="default" hover="color" :href="identity.type === 'community_enterprise' ? '#/enterprises/' + identity.enterpriseId : '#/external-enterprises/' + externalArchiveId(identity)" :disabled="!canGoEnterprise(identity)"
                  v-for="(identity, i) in displayIdentities"
                  :key="i"
                  class="identity-card"
                  :class="{ clickable: canGoEnterprise(identity) }"
                >
                  <div class="identity-card-head">
                    <span class="identity-name">{{ identityName(identity) }}<t-tag v-if="identity.enterpriseId" class="id-tag" size="small" variant="light">{{ identity.enterpriseId }}</t-tag></span>
                    <div class="identity-card-tags">
                      <t-tag v-if="identity.type === 'community_individual'" variant="light" size="small">
                        {{ identity.level ? `${identity.level} 级` : '社区个体' }}
                      </t-tag>
                      <template v-else>
                        <t-tag variant="outline" size="small">{{ identityTypeMap[identity.type] }}</t-tag>
                        <t-tag v-if="identity.role" variant="light" size="small">
                          {{ roleLabelMap[identity.role] }}
                        </t-tag>
                      </template>
                    </div>
                  </div>
                  <div v-if="identity.type !== 'community_individual'" class="identity-card-meta">
                    <span>职位/头衔：{{ identity.title }}</span>
                    <span v-if="identity.level">
                      经验值等级：{{ identity.level }} 级
                    </span>
                  </div>
                </t-link>
              </div>
            </div>
          </t-tab-panel>

          <t-tab-panel v-if="communityIndividualIdentity" value="card" label="名片">
            <UserCardTab :uid="user.uid" />
          </t-tab-panel>

          <!-- 申请记录 -->
          <t-tab-panel value="applications" label="申请记录">
            <div class="tab-body">
              <div
                v-if="recordsLoading && !currentApplications.length && !historyApplications.length"
                class="record-loading"
              >
                <t-loading size="small" />
              </div>
              <ListErrorState
                v-else-if="recordsError"
                :message="recordsError"
                :loading="recordsLoading"
                @retry="loadRecords"
              />
              <template v-else-if="currentApplications.length || historyApplications.length">
                <template v-if="currentApplications.length">
                  <div class="record-section-title">进行中（{{ currentApplications.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="currentApplications"
                    :columns="applicationColumns"
                    :loading="recordsLoading"
                  >
                    <template #appType="{ row }">
                      {{ applicationTypeMap[row.type]?.label ?? row.type }}
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="application" :value="row.status" />
                    </template>
                  </t-table>
                </template>
                <t-divider
                  v-if="currentApplications.length && historyApplications.length"
                  class="record-divider"
                />
                <template v-if="historyApplications.length">
                  <div class="record-section-title">历史记录（{{ historyApplications.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="historyApplications"
                    :columns="applicationColumns"
                    :loading="recordsLoading"
                  >
                    <template #appType="{ row }">
                      {{ applicationTypeMap[row.type]?.label ?? row.type }}
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="application" :value="row.status" />
                    </template>
                  </t-table>
                </template>
              </template>
              <t-empty v-else description="暂无申请记录" />
            </div>
          </t-tab-panel>

          <!-- 需求记录 -->
          <t-tab-panel value="demands" label="需求记录">
            <div class="tab-body">
              <div
                v-if="recordsLoading && !currentDemands.length && !historyDemands.length"
                class="record-loading"
              >
                <t-loading size="small" />
              </div>
              <ListErrorState
                v-else-if="recordsError"
                :message="recordsError"
                :loading="recordsLoading"
                @retry="loadRecords"
              />
              <template v-else-if="currentDemands.length || historyDemands.length">
                <template v-if="currentDemands.length">
                  <div class="record-section-title">进行中（{{ currentDemands.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="currentDemands"
                    :columns="demandColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserDemandRecord }) => goDemandRecord(row)"
                  >
                    <template #op-demand="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goDemandRecord(row)">详情</t-button>
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="demand" :value="row.status" />
                    </template>
                  </t-table>
                </template>
                <t-divider
                  v-if="currentDemands.length && historyDemands.length"
                  class="record-divider"
                />
                <template v-if="historyDemands.length">
                  <div class="record-section-title">历史记录（{{ historyDemands.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="historyDemands"
                    :columns="demandColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserDemandRecord }) => goDemandRecord(row)"
                  >
                    <template #op-demand="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goDemandRecord(row)">详情</t-button>
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="demand" :value="row.status" />
                    </template>
                  </t-table>
                </template>
              </template>
              <t-empty v-else description="暂无需求记录" />
            </div>
          </t-tab-panel>

          <!-- 项目记录 -->
          <t-tab-panel value="projects" label="项目记录">
            <div class="tab-body">
              <div
                v-if="recordsLoading && !currentProjects.length && !historyProjects.length"
                class="record-loading"
              >
                <t-loading size="small" />
              </div>
              <ListErrorState
                v-else-if="recordsError"
                :message="recordsError"
                :loading="recordsLoading"
                @retry="loadRecords"
              />
              <template v-else-if="currentProjects.length || historyProjects.length">
                <template v-if="currentProjects.length">
                  <div class="record-section-title">进行中（{{ currentProjects.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="currentProjects"
                    :columns="projectColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserProjectRecord }) => goProjectRecord(row)"
                  >
                    <template #op-project="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goProjectRecord(row)">详情</t-button>
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="project" :value="row.status" />
                    </template>
                  </t-table>
                </template>
                <t-divider
                  v-if="currentProjects.length && historyProjects.length"
                  class="record-divider"
                />
                <template v-if="historyProjects.length">
                  <div class="record-section-title">历史记录（{{ historyProjects.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="historyProjects"
                    :columns="projectColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserProjectRecord }) => goProjectRecord(row)"
                  >
                    <template #op-project="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goProjectRecord(row)">详情</t-button>
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="project" :value="row.status" />
                    </template>
                  </t-table>
                </template>
              </template>
              <t-empty v-else description="暂无项目记录" />
            </div>
          </t-tab-panel>

          <!-- 活动记录 -->
          <t-tab-panel value="events" label="活动记录">
            <div class="tab-body">
              <div
                v-if="recordsLoading && !currentEvents.length && !historyEvents.length"
                class="record-loading"
              >
                <t-loading size="small" />
              </div>
              <ListErrorState
                v-else-if="recordsError"
                :message="recordsError"
                :loading="recordsLoading"
                @retry="loadRecords"
              />
              <template v-else-if="currentEvents.length || historyEvents.length">
                <template v-if="currentEvents.length">
                  <div class="record-section-title">进行中（{{ currentEvents.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="currentEvents"
                    :columns="eventColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserEventRecord }) => goEventRecord(row)"
                  >
                    <template #op-event="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goEventRecord(row)">详情</t-button>
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="event" :value="row.status" />
                    </template>
                    <template #time="{ row }">{{ eventTime(row) }}</template>
                  </t-table>
                </template>
                <t-divider
                  v-if="currentEvents.length && historyEvents.length"
                  class="record-divider"
                />
                <template v-if="historyEvents.length">
                  <div class="record-section-title">历史记录（{{ historyEvents.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="historyEvents"
                    :columns="eventColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserEventRecord }) => goEventRecord(row)"
                  >
                    <template #op-event="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goEventRecord(row)">详情</t-button>
                    </template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="event" :value="row.status" />
                    </template>
                    <template #time="{ row }">{{ eventTime(row) }}</template>
                  </t-table>
                </template>
              </template>
              <t-empty v-else description="暂无活动记录" />
            </div>
          </t-tab-panel>

          <!-- 租赁记录 -->
          <t-tab-panel value="leases" label="租赁记录">
            <div class="tab-body">
              <div
                v-if="recordsLoading && !currentLeases.length && !historyLeases.length"
                class="record-loading"
              >
                <t-loading size="small" />
              </div>
              <ListErrorState
                v-else-if="recordsError"
                :message="recordsError"
                :loading="recordsLoading"
                @retry="loadRecords"
              />
              <template v-else-if="currentLeases.length || historyLeases.length">
                <template v-if="currentLeases.length">
                  <div class="record-section-title">进行中（{{ currentLeases.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="currentLeases"
                    :columns="recordLeaseColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserLeaseRecord }) => goLeaseRecord(row)"
                  >
                    <template #op-lease="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goLeaseRecord(row)">详情</t-button>
                    </template>
                    <template #term="{ row }">{{ recordLeaseTerm(row) }}</template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="lease" :value="row.status" />
                    </template>
                    <template #terminatedAt="{ row }">{{ row.terminatedAt ?? '—' }}</template>
                  </t-table>
                </template>
                <t-divider
                  v-if="currentLeases.length && historyLeases.length"
                  class="record-divider"
                />
                <template v-if="historyLeases.length">
                  <div class="record-section-title">历史记录（{{ historyLeases.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="historyLeases"
                    :columns="recordLeaseColumns"
                    :loading="recordsLoading"
                    :row-attributes="{ style: { cursor: 'pointer' } }"
                    @row-click="({ row }: { row: UserLeaseRecord }) => goLeaseRecord(row)"
                  >
                    <template #op-lease="{ row }">
                      <t-button theme="primary" variant="text" size="small" @click.stop="goLeaseRecord(row)">详情</t-button>
                    </template>
                    <template #term="{ row }">{{ recordLeaseTerm(row) }}</template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="lease" :value="row.status" />
                    </template>
                    <template #terminatedAt="{ row }">{{ row.terminatedAt ?? '—' }}</template>
                  </t-table>
                </template>
              </template>
              <t-empty v-else description="暂无租赁记录" />
            </div>
          </t-tab-panel>

          <!-- 投稿记录 -->
          <t-tab-panel value="submissions" label="投稿记录">
            <div class="tab-body">
              <div
                v-if="recordsLoading && !currentSubmissions.length && !historySubmissions.length"
                class="record-loading"
              >
                <t-loading size="small" />
              </div>
              <ListErrorState
                v-else-if="recordsError"
                :message="recordsError"
                :loading="recordsLoading"
                @retry="loadRecords"
              />
              <template v-else-if="currentSubmissions.length || historySubmissions.length">
                <template v-if="currentSubmissions.length">
                  <div class="record-section-title">进行中（{{ currentSubmissions.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="currentSubmissions"
                    :columns="submissionColumns"
                    :loading="recordsLoading"
                  >
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="article" :value="row.status" />
                    </template>
                  </t-table>
                </template>
                <t-divider
                  v-if="currentSubmissions.length && historySubmissions.length"
                  class="record-divider"
                />
                <template v-if="historySubmissions.length">
                  <div class="record-section-title">历史记录（{{ historySubmissions.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="historySubmissions"
                    :columns="submissionColumns"
                    :loading="recordsLoading"
                  >
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="article" :value="row.status" />
                    </template>
                  </t-table>
                </template>
              </template>
              <t-empty v-else description="暂无投稿记录" />
            </div>
          </t-tab-panel>

          <!-- 预约记录 -->
          <t-tab-panel value="reservations" label="预约记录">
            <div class="tab-body">
              <div
                v-if="recordsLoading && !currentReservations.length && !historyReservations.length"
                class="record-loading"
              >
                <t-loading size="small" />
              </div>
              <ListErrorState
                v-else-if="recordsError"
                :message="recordsError"
                :loading="recordsLoading"
                @retry="loadRecords"
              />
              <template v-else-if="currentReservations.length || historyReservations.length">
                <template v-if="currentReservations.length">
                  <div class="record-section-title">进行中（{{ currentReservations.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="currentReservations"
                    :columns="reservationColumns"
                    :loading="recordsLoading"
                  >
                    <template #time="{ row }">{{ reservationTime(row) }}</template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="reservation" :value="reservationStatus(row)" />
                    </template>
                  </t-table>
                </template>
                <t-divider
                  v-if="currentReservations.length && historyReservations.length"
                  class="record-divider"
                />
                <template v-if="historyReservations.length">
                  <div class="record-section-title">历史记录（{{ historyReservations.length }}）</div>
                  <t-table
                    row-key="id"
                    table-layout="fixed"
                    hover
                    size="small"
                    :data="historyReservations"
                    :columns="reservationColumns"
                    :loading="recordsLoading"
                  >
                    <template #time="{ row }">{{ reservationTime(row) }}</template>
                    <template #status="{ row }">
                      <t-tag v-if="row.deletedAt" theme="default" variant="light">已归档</t-tag>
                      <StatusTag v-else entity="reservation" :value="reservationStatus(row)" />
                    </template>
                  </t-table>
                </template>
              </template>
              <t-empty v-else description="暂无预约记录" />
            </div>
          </t-tab-panel>

          <!-- 经验值：仅持有社区个体身份的用户展示 -->
          <t-tab-panel v-if="communityIndividualIdentity" value="experience" label="经验值">
            <div class="tab-body">
              <div class="exp-head">
                <div class="exp-balance">
                  <span class="exp-label">社区个体 · 当前经验值</span>
                  <span class="exp-num">{{ communityIndividualIdentity.experience ?? 0 }}</span>
                  <t-tag v-if="communityIndividualIdentity.level" variant="light" size="small">
                    {{ communityIndividualIdentity.level }} 级
                  </t-tag>
                </div>
                <t-button theme="primary" @click="expAdjustVisible = true">调整经验值</t-button>
              </div>
              <t-table
                row-key="id"
                table-layout="fixed"
                :data="experienceRecords"
                :columns="ledgerColumns"
                empty="暂无经验值流水"
              >
                <template #delta="{ row }">
                  <span :class="row.delta > 0 ? 'delta-add' : 'delta-sub'">
                    {{ row.delta > 0 ? `+${row.delta}` : row.delta }}
                  </span>
                </template>
              </t-table>
            </div>
          </t-tab-panel>

          <!-- 积分：挂靠个人用户身份，所有用户展示 -->
          <t-tab-panel value="points" label="积分">
            <div class="tab-body">
              <div class="exp-head">
                <div class="exp-balance">
                  <span class="exp-label">当前积分（个人用户）</span>
                  <span class="exp-num">{{ user.points }}</span>
                </div>
                <t-button theme="primary" @click="pointsAdjustVisible = true">调整积分</t-button>
              </div>
              <t-table
                row-key="id"
                table-layout="fixed"
                :data="pointsRecords"
                :columns="ledgerColumns"
                empty="暂无积分流水"
              >
                <template #delta="{ row }">
                  <span :class="row.delta > 0 ? 'delta-add' : 'delta-sub'">
                    {{ row.delta > 0 ? `+${row.delta}` : row.delta }}
                  </span>
                </template>
              </t-table>
            </div>
          </t-tab-panel>

          <t-tab-panel value="activities" label="活跃记录">
            <div class="tab-body">
              <t-empty v-if="user.activities.length === 0" description="暂无活跃记录" />
              <t-timeline v-else class="activity-timeline" mode="same">
                <t-timeline-item v-for="(act, i) in user.activities" :key="i">
                  <div class="act-content">{{ act.content }}</div>
                  <div class="act-time">{{ act.time }}</div>
                </t-timeline-item>
              </t-timeline>
            </div>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>

    <!-- 编辑用户资料 -->
    <t-dialog
      :visible="editVisible"
      header="编辑用户资料"
      width="560px"
      :close-on-overlay-click="false"
      @close="closeEdit"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="closeEdit">取消</t-button>
          <t-button theme="primary" :loading="editSaving" @click="onConfirmEdit">保存</t-button>
        </div>
      </template>
      <t-form ref="editFormRef" :data="editForm" :rules="editRules" label-align="top">
        <!-- 头像：直接上传图片（回填素材 URL），替换头像卡片即完成编辑，删除即回退昵称首字占位 -->
        <t-form-item label="头像" name="avatar">
          <ImageUploadField
            v-model="editForm.avatar"
            biz-type="avatar"
            tip="选择本地图片即上传并替换（建议 1:1 方图）；上传后同步展示在客户端「我的」等页面"
          />
        </t-form-item>
        <t-form-item label="用户名" name="username">
          <t-input v-model="editForm.username" name="username" autocomplete="off" placeholder="请输入用户名…" />
        </t-form-item>
        <t-form-item label="昵称" name="nickname">
          <t-input v-model="editForm.nickname" name="nickname" autocomplete="off" placeholder="请输入昵称…" />
        </t-form-item>
        <t-form-item label="手机号" name="phone">
          <t-input v-model="editForm.phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="请输入手机号…" />
        </t-form-item>
        <t-form-item label="邮箱" name="email">
          <t-input v-model="editForm.email" name="email" inputmode="email" autocomplete="email" placeholder="请输入邮箱…" />
        </t-form-item>
        <t-form-item label="性别" name="gender">
          <t-select v-model="editForm.gender" :options="userGenderOptions" placeholder="请选择性别…" />
        </t-form-item>
        <t-form-item label="真实姓名" name="realName">
          <t-input v-model="editForm.realName" name="real-name" autocomplete="name" placeholder="请输入真实姓名…" />
        </t-form-item>
        <t-form-item label="身份证号" name="citizenId">
          <t-input v-model="editForm.citizenId" name="citizen-id" inputmode="text" autocomplete="off" :spellcheck="false" placeholder="请输入身份证号…" />
        </t-form-item>
        <t-form-item label="简介" name="bio">
          <t-textarea v-model="editForm.bio" :autosize="{ minRows: 3, maxRows: 5 }" placeholder="请输入简介…" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 冻结账号：冻结期限（日期+时间）或长期（开关，默认关）+ 冻结原因（必填） -->
    <t-dialog
      :visible="freezeVisible"
      :header="user ? `冻结账号 · ${user.nickname} [${user.uid}]` : '冻结账号'"
      width="480px"
      :close-on-overlay-click="false"
      @close="closeFreeze"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="closeFreeze">取消</t-button>
          <t-button theme="danger" :loading="freezeSaving" @click="onConfirmFreeze">确认冻结</t-button>
        </div>
      </template>
      <t-form ref="freezeFormRef" :data="freezeForm" :rules="freezeRules" label-align="top">
        <t-form-item label="冻结原因" name="reason">
          <t-textarea
            v-model="freezeForm.reason"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="请填写冻结原因（必填），将记录在账号信息中…"
          />
        </t-form-item>
        <t-form-item label="长期冻结" name="permanent">
          <div class="freeze-permanent">
            <t-switch v-model="freezeForm.permanent" />
            <span class="freeze-tip">开启后不设解冻时间，需手动解冻</span>
          </div>
        </t-form-item>
        <t-form-item v-if="!freezeForm.permanent" label="冻结期限" name="until">
          <t-date-picker
            v-model="freezeForm.until"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            placeholder="选择冻结截止时间…"
            class="ctl-w-full"
          />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 重置密码：管理员强制覆盖用户登录密码（提交前二次确认） -->
    <t-dialog
      :visible="resetPwdVisible"
      :header="user ? `重置密码 · ${user.nickname} [${user.uid}]` : '重置密码'"
      width="480px"
      :close-on-overlay-click="false"
      @close="closeResetPwd"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="closeResetPwd">取消</t-button>
          <t-button theme="danger" :loading="resetPwdSaving" @click="onConfirmResetPwd">确认重置</t-button>
        </div>
      </template>
      <t-form ref="resetPwdFormRef" :data="resetPwdForm" :rules="resetPwdRules" label-align="top">
        <t-form-item label="新密码" name="password">
          <t-input
            v-model="resetPwdForm.password"
            type="password"
            clearable
            placeholder="至少 8 位，需包含字母和数字…"
          />
        </t-form-item>
        <t-form-item label="确认新密码" name="confirmPassword">
          <t-input v-model="resetPwdForm.confirmPassword" type="password" clearable placeholder="请再次输入新密码…" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 经验值调整（社区个体） -->
    <AdjustValueDialog
      v-model:visible="expAdjustVisible"
      :header="`调整经验值 · ${user?.realName ?? user?.nickname ?? ''}`"
      balance-label="当前经验值（社区个体）"
      :balance="communityIndividualIdentity?.experience ?? 0"
      :loading="expAdjusting"
      @submit="onAdjustExperience"
    />

    <!-- 积分调整 -->
    <AdjustValueDialog
      v-model:visible="pointsAdjustVisible"
      :header="`调整积分 · ${user?.realName ?? user?.nickname ?? ''}`"
      balance-label="当前积分（个人用户）"
      :balance="user?.points ?? 0"
      :loading="pointsAdjusting"
      @submit="onAdjustPoints"
    />
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.profile-card {
  margin-bottom: 16px;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.profile-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.profile-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.profile-name {
  font-size: 20px;
  font-weight: 600;
  line-height: 26px;
  color: var(--td-text-color-primary);
}

.profile-id {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.profile-desc {
  margin-bottom: 16px;
}

.channel-value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.profile-bio {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}

.identity-list {
  display: grid;
  gap: 12px;
  padding-top: 8px;
}

.identity-card {
  display: block;
  white-space: normal;
  text-align: left;
  padding: 12px 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.identity-card.clickable {
  cursor: pointer;
  transition: border-color 120ms ease;
}

/* 触屏无 hover：仅指针设备启用变色，避免粘滞 hover 被误读为选中态（L-04） */
@media (hover: hover) {
  .identity-card.clickable:hover {
    border-color: var(--td-brand-color);
  }
}

.identity-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.identity-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.identity-card-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.identity-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.activity-timeline {
  padding-top: 8px;
}

.act-content {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.act-time {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.tab-body {
  padding: 16px 0 8px;
}

.record-section-title {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-secondary);
}

.record-divider {
  margin: 16px 0;
}

.record-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.exp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.exp-balance {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exp-label {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.exp-num {
  font-size: 20px;
  font-weight: 600;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}

.delta-add {
  color: var(--td-success-color);
  font-weight: 600;
}

.delta-sub {
  color: var(--td-error-color);
  font-weight: 600;
}

.freeze-permanent {
  display: flex;
  align-items: center;
  gap: 12px;
}

.freeze-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
