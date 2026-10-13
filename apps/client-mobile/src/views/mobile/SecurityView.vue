<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Cell, CellGroup, DialogPlugin, Input, Popup, Textarea, Toast } from 'tdesign-mobile-vue'
import { changeEmail, changePhone, sendEmailCode, sendSmsCode } from '@/api/auth'
import { cancelAccountDeletion, changePassword, downloadPersonalData, fetchAccountRequests, fetchMe, requestAccountDeletion, requestDataExport } from '@/api/me'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { formatLocalDateTime } from '@/utils/format'
import { EMAIL_MSG, isEmail, isPhone, isSmsCode, PHONE_MSG } from '@/utils/validators'
import type { UserProfile } from '@/types'

/* 账号与安全：修改密码 / 绑定手机号 / 绑定邮箱 / 注销申请 / 数据导出。 */
const router = useRouter()
const auth = useAuthStore()

const requests = ref<{ deletion?: { reason?: string; at: string; cancelableUntil?: string }; export?: { at: string; url?: string } }>({})
const profile = ref<UserProfile | null>(null)
const loadError = ref('')

async function loadAll() {
  loadError.value = ''
  try {
    requests.value = await fetchAccountRequests()
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : '加载失败，请稍后重试'
  }
  try {
    profile.value = await fetchMe()
  } catch {
    /* 绑定信息展示失败不阻断页面其余功能 */
  }
}
onMounted(loadAll)

/* ---- 绑定信息（脱敏展示） ---- */
function maskPhone(value: string): string {
  return /^\d{11}$/.test(value) ? `${value.slice(0, 3)}****${value.slice(-4)}` : value
}
function maskEmail(value: string): string {
  const [name, domain] = value.split('@')
  if (!domain) return value
  return `${name.slice(0, 1)}***@${domain}`
}
const phoneNote = computed(() => {
  const phone = profile.value?.phone
  if (!phone) return '未绑定'
  return `${maskPhone(phone)}${profile.value?.phoneVerified ? '' : '（未验证）'}`
})
const emailNote = computed(() => {
  const email = profile.value?.email
  if (!email) return '未绑定'
  return `${maskEmail(email)}${profile.value?.emailVerified ? '' : '（未验证）'}`
})

/* ---- 修改密码：成功后服务端强制全端登出，客户端清理会话并回登录页 ---- */
const pwdVisible = ref(false)
const pwdForm = reactive({ oldPassword: '', password: '', confirm: '' })
/* v40：行内校验错误 */
const pwdErrors = reactive({ oldPassword: '', password: '', confirm: '' })
watch(() => pwdForm.oldPassword, () => (pwdErrors.oldPassword = ''))
watch(() => pwdForm.password, () => (pwdErrors.password = ''))
watch(() => pwdForm.confirm, () => (pwdErrors.confirm = ''))
const pwdSaving = ref(false)

function onPwdSave() {
  pwdErrors.oldPassword = ''
  pwdErrors.password = ''
  pwdErrors.confirm = ''
  if (!pwdForm.oldPassword) {
    pwdErrors.oldPassword = '请输入原密码'
    return void Toast(pwdErrors.oldPassword)
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pwdForm.password)) {
    pwdErrors.password = '新密码至少 8 位且包含字母与数字'
    return void Toast(pwdErrors.password)
  }
  if (pwdForm.password !== pwdForm.confirm) {
    pwdErrors.confirm = '两次输入的新密码不一致'
    return void Toast(pwdErrors.confirm)
  }
  pwdSaving.value = true
  changePassword({ oldPassword: pwdForm.oldPassword, password: pwdForm.password })
    .then(() => {
      Toast('密码已修改，请重新登录')
      pwdVisible.value = false
      pwdForm.oldPassword = ''
      pwdForm.password = ''
      pwdForm.confirm = ''
      auth.resetSession()
      void router.replace('/login')
    })
    .catch((e) => Toast(e instanceof ApiError ? e.message : '修改失败，请稍后重试'))
    .finally(() => {
      pwdSaving.value = false
    })
}

/* ---- 验证码倒计时 ---- */
const phoneCountdown = ref(0)
const emailCountdown = ref(0)
let phoneTimer: number | undefined
let emailTimer: number | undefined
function stopCountdown(kind: 'phone' | 'email') {
  if (kind === 'phone') {
    window.clearInterval(phoneTimer)
    phoneTimer = undefined
    phoneCountdown.value = 0
  } else {
    window.clearInterval(emailTimer)
    emailTimer = undefined
    emailCountdown.value = 0
  }
}

function startCountdown(kind: 'phone' | 'email', seconds = 60) {
  stopCountdown(kind)
  const timerRef = kind === 'phone' ? phoneCountdown : emailCountdown
  timerRef.value = seconds
  const timer = window.setInterval(() => {
    timerRef.value -= 1
    if (timerRef.value <= 0) stopCountdown(kind)
  }, 1000)
  if (kind === 'phone') phoneTimer = timer
  else emailTimer = timer
}
onBeforeUnmount(() => {
  window.clearInterval(phoneTimer)
  window.clearInterval(emailTimer)
})

/* ---- 绑定 / 更换手机号 ---- */
const phoneVisible = ref(false)
const phoneForm = reactive({ newPhone: '', smsCode: '' })
const phoneErrors = reactive({ newPhone: '', smsCode: '' })
const phoneSaving = ref(false)
const phoneSending = ref(false)

/* 已绑定时入口/弹窗按「更换」口径呈现，未绑定时按「绑定」口径呈现 */
const hasPhone = computed(() => Boolean(profile.value?.phone))
const phoneTitle = computed(() => (hasPhone.value ? '更换手机号' : '绑定手机号'))
const phoneFieldLabel = computed(() => (hasPhone.value ? '新手机号' : '手机号'))
const phoneSubmitText = computed(() => (hasPhone.value ? '确认更换' : '确认绑定'))

/* 新号变更后原验证码即失效：清空验证码并解除倒计时，避免提交必然失败的请求 */
watch(() => phoneForm.newPhone, () => {
  phoneErrors.newPhone = ''
  if (phoneForm.smsCode || phoneCountdown.value > 0) {
    phoneForm.smsCode = ''
    phoneErrors.smsCode = ''
    stopCountdown('phone')
  }
})
watch(() => phoneForm.smsCode, () => (phoneErrors.smsCode = ''))

/** 与当前已绑定手机号相同则直接拦截，避免无意义的换绑请求 */
function isSameAsCurrentPhone(): boolean {
  const current = profile.value?.phone ?? ''
  if (current && phoneForm.newPhone.trim() === current) {
    phoneErrors.newPhone = '新手机号与当前手机号相同，无需更换'
    Toast(phoneErrors.newPhone)
    return true
  }
  return false
}

async function onSendPhoneCode() {
  phoneErrors.newPhone = ''
  if (!isPhone(phoneForm.newPhone.trim())) {
    phoneErrors.newPhone = PHONE_MSG
    return void Toast(phoneErrors.newPhone)
  }
  if (isSameAsCurrentPhone()) return
  phoneSending.value = true
  try {
    const result = await sendSmsCode({ phone: phoneForm.newPhone.trim(), purpose: 'change_phone' })
    Toast(result.devCode ? `验证码已发送（演示码 ${result.devCode}）` : '验证码已发送')
    startCountdown('phone')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '验证码发送失败，请稍后重试')
  } finally {
    phoneSending.value = false
  }
}

function onPhoneSave() {
  phoneErrors.newPhone = ''
  phoneErrors.smsCode = ''
  if (!isPhone(phoneForm.newPhone.trim())) {
    phoneErrors.newPhone = PHONE_MSG
    return void Toast(phoneErrors.newPhone)
  }
  if (isSameAsCurrentPhone()) return
  if (!isSmsCode(phoneForm.smsCode)) {
    phoneErrors.smsCode = '请输入 6 位验证码'
    return void Toast(phoneErrors.smsCode)
  }
  phoneSaving.value = true
  changePhone({ newPhone: phoneForm.newPhone.trim(), smsCode: phoneForm.smsCode.trim() })
    .then(async () => {
      Toast('手机号已更新')
      stopCountdown('phone')
      phoneVisible.value = false
      phoneForm.newPhone = ''
      phoneForm.smsCode = ''
      profile.value = await fetchMe().catch(() => profile.value)
    })
    .catch((e) => {
      Toast(e instanceof ApiError ? e.message : '更新失败，请稍后重试')
      phoneForm.smsCode = ''
    })
    .finally(() => {
      phoneSaving.value = false
    })
}

/* ---- 绑定 / 更换邮箱 ---- */
const emailVisible = ref(false)
const emailForm = reactive({ newEmail: '', code: '' })
const emailErrors = reactive({ newEmail: '', code: '' })
watch(() => emailForm.newEmail, () => (emailErrors.newEmail = ''))
watch(() => emailForm.code, () => (emailErrors.code = ''))
const emailSaving = ref(false)
const emailSending = ref(false)

async function onSendEmailCode() {
  emailErrors.newEmail = ''
  if (!isEmail(emailForm.newEmail)) {
    emailErrors.newEmail = EMAIL_MSG
    return void Toast(emailErrors.newEmail)
  }
  emailSending.value = true
  try {
    const result = await sendEmailCode({ email: emailForm.newEmail.trim(), purpose: 'change_email' })
    Toast(result.devCode ? `验证码已发送（演示码 ${result.devCode}）` : '验证码已发送')
    startCountdown('email')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '验证码发送失败，请稍后重试')
  } finally {
    emailSending.value = false
  }
}

function onEmailSave() {
  emailErrors.newEmail = ''
  emailErrors.code = ''
  if (!isEmail(emailForm.newEmail)) {
    emailErrors.newEmail = EMAIL_MSG
    return void Toast(emailErrors.newEmail)
  }
  if (!isSmsCode(emailForm.code)) {
    emailErrors.code = '请输入 6 位验证码'
    return void Toast(emailErrors.code)
  }
  emailSaving.value = true
  changeEmail({ newEmail: emailForm.newEmail.trim(), code: emailForm.code.trim() })
    .then(async () => {
      Toast('邮箱已更新')
      emailVisible.value = false
      emailForm.newEmail = ''
      emailForm.code = ''
      profile.value = await fetchMe().catch(() => profile.value)
    })
    .catch((e) => {
      Toast(e instanceof ApiError ? e.message : '更新失败，请稍后重试')
      emailForm.code = ''
    })
    .finally(() => {
      emailSaving.value = false
    })
}

/* ---- 注销 / 数据导出 ---- */
const deletionReason = ref('')
const deletionVisible = ref(false)
const hasUnsavedSheet = computed(() => (
  (pwdVisible.value && Boolean(pwdForm.oldPassword || pwdForm.password || pwdForm.confirm))
  || (phoneVisible.value && Boolean(phoneForm.newPhone || phoneForm.smsCode))
  || (emailVisible.value && Boolean(emailForm.newEmail || emailForm.code))
  || (deletionVisible.value && Boolean(deletionReason.value.trim()))
))
useUnsavedGuard(() => hasUnsavedSheet.value)

function requestSheetClose(kind: 'password' | 'phone' | 'email' | 'deletion', visible: boolean) {
  if (visible) {
    if (kind === 'password') pwdVisible.value = true
    else if (kind === 'phone') phoneVisible.value = true
    else if (kind === 'email') emailVisible.value = true
    else deletionVisible.value = true
    return
  }
  const dirty = kind === 'password'
    ? Boolean(pwdForm.oldPassword || pwdForm.password || pwdForm.confirm)
    : kind === 'phone'
      ? Boolean(phoneForm.newPhone || phoneForm.smsCode)
      : kind === 'email'
        ? Boolean(emailForm.newEmail || emailForm.code)
        : Boolean(deletionReason.value.trim())
  const close = () => {
    if (kind === 'password') {
      pwdVisible.value = false
      Object.assign(pwdForm, { oldPassword: '', password: '', confirm: '' })
    } else if (kind === 'phone') {
      phoneVisible.value = false
      Object.assign(phoneForm, { newPhone: '', smsCode: '' })
    } else if (kind === 'email') {
      emailVisible.value = false
      Object.assign(emailForm, { newEmail: '', code: '' })
    } else {
      deletionVisible.value = false
      deletionReason.value = ''
    }
  }
  if (!dirty) return close()
  DialogPlugin.confirm({
    title: '放弃当前填写？',
    content: '关闭后，尚未提交的内容将不会保留。',
    cancelBtn: '继续填写',
    confirmBtn: '放弃填写',
    onConfirm: close,
  })
}

function onDeletionApply() {
  DialogPlugin.confirm({
    title: '申请注销账号',
    content: '注销后账号与个人数据将按合规要求处理，处理期间可继续使用。确认提交申请？',
    cancelBtn: '再想想',
    confirmBtn: '提交申请',
    onConfirm: async () => {
      try {
        await requestAccountDeletion(deletionReason.value.trim() || undefined)
        Toast('注销申请已提交')
        deletionReason.value = ''
        deletionVisible.value = false
        await loadAll()
      } catch (e) {
        Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
      }
    },
  })
}

/* v41：冷静期内撤回注销 */
const cancelDeleting = ref(false)
function onCancelDeletion() {
  DialogPlugin.confirm({
    title: '撤回注销申请',
    content: '撤回后账号将恢复正常使用，确认撤回？',
    cancelBtn: '再想想',
    confirmBtn: '确认撤回',
    onConfirm: async () => {
      cancelDeleting.value = true
      try {
        await cancelAccountDeletion()
        Toast('已撤回注销申请')
        await loadAll()
      } catch (e) {
        Toast(e instanceof ApiError ? e.message : '撤回失败，请稍后重试')
      } finally {
        cancelDeleting.value = false
      }
    },
  })
}

async function onExport() {
  try {
    if (requests.value.export?.url) {
      await downloadPersonalData(requests.value.export.url)
      Toast('已开始下载')
      return
    }
    await requestDataExport()
    Toast('导出申请已提交')
    await loadAll()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  }
}

</script>

<template>
  <div class="page-fade-in m-security">
    <p class="group-title">账号安全</p>
    <CellGroup theme="card">
      <Cell v-pressable title="修改登录密码" arrow @click="pwdVisible = true" />
      <Cell v-pressable :title="phoneTitle" :note="phoneNote" arrow @click="phoneVisible = true" />
      <Cell v-pressable title="绑定邮箱" :note="emailNote" arrow @click="emailVisible = true" />
      <Cell v-pressable title="找回密码说明" note="退出登录后可在登录页操作" arrow @click="router.push('/forgot-password')" />
    </CellGroup>

    <p class="group-title">隐私与数据</p>
    <CellGroup theme="card">
      <Cell v-pressable title="用户协议与隐私政策" arrow @click="router.push('/privacy')" />
      <Cell v-pressable title="导出个人数据" :note="requests.export ? `已生成（${formatLocalDateTime(requests.export.at)}），点击下载` : '生成后站内信通知'" arrow @click="onExport" />
      <Cell
        v-pressable="!requests.deletion"
        title="注销账号"
        :description="requests.deletion ? `申请处理中（${formatLocalDateTime(requests.deletion.at)}）` : ''"
        :arrow="!requests.deletion"
        :hover="!requests.deletion"
        @click="requests.deletion ? undefined : (deletionVisible = true)"
      />
    </CellGroup>

    <div v-if="requests.deletion" class="cooling m-card">
      <p class="cooling-text">
        注销申请处理中（{{ formatLocalDateTime(requests.deletion.at) }} 提交）<template v-if="requests.deletion.cancelableUntil">，冷静期于 {{ formatLocalDateTime(requests.deletion.cancelableUntil) }} 届满，执行前可撤回</template>
      </p>
      <Button size="small" variant="outline" :loading="cancelDeleting" @click="onCancelDeletion">撤回注销申请</Button>
    </div>

    <EmptyBlock v-if="loadError" :text="loadError" action-text="重试" @action="loadAll" />

    <Popup :visible="pwdVisible" placement="bottom" :close-btn="true" @update:visible="requestSheetClose('password', $event)">
      <!-- 密码框必须位于 form 内：否则浏览器报「Password field is not contained in a form」，
           且密码管理器无法识别该表单；回车提交也由此获得 -->
      <form class="sheet" @submit.prevent="onPwdSave">
        <h2 class="sheet-title">修改登录密码</h2>
        <div class="field"><label>原密码</label><Input v-model="pwdForm.oldPassword" type="password" autocomplete="current-password" placeholder="请输入原密码…" clearable /><p v-if="pwdErrors.oldPassword" class="field-error">{{ pwdErrors.oldPassword }}</p></div>
        <div class="field"><label>新密码</label><Input v-model="pwdForm.password" type="password" autocomplete="new-password" placeholder="至少 8 位，含字母与数字…" clearable /><p v-if="pwdErrors.password" class="field-error">{{ pwdErrors.password }}</p></div>
        <div class="field"><label>确认新密码</label><Input v-model="pwdForm.confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码…" clearable /><p v-if="pwdErrors.confirm" class="field-error">{{ pwdErrors.confirm }}</p></div>
        <p class="sheet-tip">修改成功后需使用新密码重新登录。</p>
        <Button theme="primary" size="large" block type="submit" :loading="pwdSaving">保存</Button>
      </form>
    </Popup>

    <Popup :visible="phoneVisible" placement="bottom" :close-btn="true" @update:visible="requestSheetClose('phone', $event)">
      <!-- 置于 form 内：回车即可提交，浏览器/密码管理器也能识别为一次完整表单提交 -->
      <form class="sheet" @submit.prevent="onPhoneSave">
        <h2 class="sheet-title">{{ phoneTitle }}</h2>
        <p class="sheet-tip">
          <template v-if="hasPhone">当前：{{ phoneNote }}。更换后新手机号可用于登录与接收通知。</template>
          <template v-else>绑定后手机号可用于登录与接收通知。</template>
        </p>
        <div class="field"><label>{{ phoneFieldLabel }}</label><Input v-model="phoneForm.newPhone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入手机号…" clearable /><p v-if="phoneErrors.newPhone" class="field-error">{{ phoneErrors.newPhone }}</p></div>
        <div class="field">
          <label>短信验证码</label>
          <div class="code-row">
            <Input v-model="phoneForm.smsCode" class="code-input" :maxlength="6" inputmode="numeric" :spell-check="false" placeholder="请输入 6 位验证码…" clearable />
            <Button class="code-button" type="button" theme="light" :disabled="phoneSending || phoneCountdown > 0" @click="onSendPhoneCode">
              {{ phoneCountdown > 0 ? `${phoneCountdown}s` : phoneSending ? '发送中…' : '获取验证码' }}
            </Button>
          </div>
          <p v-if="phoneErrors.smsCode" class="field-error">{{ phoneErrors.smsCode }}</p>
        </div>
        <Button theme="primary" size="large" block type="submit" :loading="phoneSaving">{{ phoneSubmitText }}</Button>
      </form>
    </Popup>

    <Popup :visible="emailVisible" placement="bottom" :close-btn="true" @update:visible="requestSheetClose('email', $event)">
      <div class="sheet">
        <h2 class="sheet-title">绑定邮箱</h2>
        <p class="sheet-tip">当前：{{ emailNote }}。绑定后邮箱可用于登录与接收通知。</p>
        <div class="field"><label>新邮箱</label><Input v-model="emailForm.newEmail" type="text" autocomplete="email" placeholder="请输入新邮箱…" clearable /><p v-if="emailErrors.newEmail" class="field-error">{{ emailErrors.newEmail }}</p></div>
        <div class="field">
          <label>邮箱验证码</label>
          <div class="code-row">
            <Input v-model="emailForm.code" class="code-input" :maxlength="6" inputmode="numeric" :spell-check="false" placeholder="请输入 6 位验证码…" clearable />
            <Button class="code-button" theme="light" :disabled="emailSending || emailCountdown > 0" @click="onSendEmailCode">
              {{ emailCountdown > 0 ? `${emailCountdown}s` : emailSending ? '发送中…' : '获取验证码' }}
            </Button>
          </div>
          <p v-if="emailErrors.code" class="field-error">{{ emailErrors.code }}</p>
        </div>
        <Button theme="primary" size="large" block :loading="emailSaving" @click="onEmailSave">确认绑定</Button>
      </div>
    </Popup>

    <Popup :visible="deletionVisible" placement="bottom" :close-btn="true" @update:visible="requestSheetClose('deletion', $event)">
      <div class="sheet">
        <h2 class="sheet-title">注销账号</h2>
        <p class="sheet-tip">提交后社区运营将与你确认；注销后身份、积分与内容将按合规要求处理。可填写原因帮助我们改进：</p>
        <Textarea v-model="deletionReason" :autosize="{ minRows: 3, maxRows: 6 }" :maxlength="200" placeholder="注销原因（选填）…" />
        <Button theme="danger" size="large" block @click="onDeletionApply">提交注销申请</Button>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.m-security {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

/* v43：CellGroup 自带左右 16px 外边距，与页面 padding 叠加会导致卡片偏窄 */
.m-security :deep(.t-cell-group--card) {
  margin:0;
  border: 1px solid var(--td-component-border);
}

/* 分组标题口径与 MeView 等二级页一致（外层纵向 flex 的 gap 负责组间间距） */
.group-title {
  margin:0 var(--app-space-1);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.empty-tip {
  margin:0;
  padding:var(--app-space-4) var(--app-space-1);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-placeholder);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
  padding: var(--app-space-8) var(--app-space-8) calc(var(--app-space-8) + env(safe-area-inset-bottom));
}

.sheet-title {
  margin:0;
  font: var(--app-type-section);
}

.sheet-tip {
  margin:0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.code-row {
  display: flex;
  align-items: center;
  gap:var(--app-space-5);
}

.code-input {
  flex: 1;
  min-width: 0;
}

.code-button {
  flex-shrink: 0;
  /* 固定宽度避免倒计时文案变化引起输入框宽度抖动（108px = 24×4 + 12） */
  min-width: calc(var(--app-space-9) * 4 + var(--app-space-5));
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

</style>
