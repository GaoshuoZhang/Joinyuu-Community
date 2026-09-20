<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Cell, CellGroup, DialogPlugin, Input, Popup, Textarea, Toast } from 'tdesign-mobile-vue'
import { changePhone } from '@/api/auth'
import { cancelAccountDeletion, changePassword, downloadPersonalData, fetchAccountRequests, requestAccountDeletion, requestDataExport } from '@/api/me'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { useCaptcha } from '@/composables/useCaptcha'
import CaptchaField from '@/components/CaptchaField.vue'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { formatLocalDateTime } from '@/utils/format'

/* 账号与安全：修改密码 / 更换手机号 / 注销申请 / 数据导出。
 * 短信与三要素实名当前按 M2-R 既定降级方案实现。 */
const router = useRouter()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()

const requests = ref<{ deletion?: { reason?: string; at: string; cancelableUntil?: string }; export?: { at: string; url?: string } }>({})
const loadError = ref('')

async function loadAll() {
  loadError.value = ''
  try {
    requests.value = await fetchAccountRequests()
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : '加载失败，请稍后重试'
  }
}
onMounted(loadAll)

/* ---- 修改密码 ---- */
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
      Toast('密码已修改')
      pwdVisible.value = false
      pwdForm.oldPassword = ''
      pwdForm.password = ''
      pwdForm.confirm = ''
    })
    .catch((e) => Toast(e instanceof ApiError ? e.message : '修改失败，请稍后重试'))
    .finally(() => {
      pwdSaving.value = false
    })
}

/* ---- 更换手机号 ---- */
const phoneVisible = ref(false)
const phoneForm = reactive({ phone: '', captchaCode: '' })
const phoneErrors = reactive({ phone: '', captchaCode: '' })
watch(() => phoneForm.phone, () => (phoneErrors.phone = ''))
watch(() => phoneForm.captchaCode, () => (phoneErrors.captchaCode = ''))
const phoneSaving = ref(false)

function onPhoneSave() {
  phoneErrors.phone = ''
  phoneErrors.captchaCode = ''
  if (!/^1\d{10}$/.test(phoneForm.phone.trim())) {
    phoneErrors.phone = '请输入 11 位手机号'
    return void Toast(phoneErrors.phone)
  }
  if (!phoneForm.captchaCode.trim()) {
    phoneErrors.captchaCode = '请输入验证码'
    return void Toast(phoneErrors.captchaCode)
  }
  phoneSaving.value = true
  changePhone({ phone: phoneForm.phone.trim(), captchaId: captchaId.value, captchaCode: phoneForm.captchaCode.trim() })
    .then(() => {
      Toast('手机号已更新')
      phoneVisible.value = false
      phoneForm.phone = ''
      phoneForm.captchaCode = ''
    })
    .catch((e) => {
      Toast(e instanceof ApiError ? e.message : '更新失败，请稍后重试')
      phoneForm.captchaCode = ''
      void refreshCaptcha()
    })
    .finally(() => {
      phoneSaving.value = false
    })
}

/* ---- 注销 / 数据导出 ---- */
const deletionReason = ref('')
const deletionVisible = ref(false)
const hasUnsavedSheet = computed(() => (
  (pwdVisible.value && Boolean(pwdForm.oldPassword || pwdForm.password || pwdForm.confirm))
  || (phoneVisible.value && Boolean(phoneForm.phone || phoneForm.captchaCode))
  || (deletionVisible.value && Boolean(deletionReason.value.trim()))
))
useUnsavedGuard(() => hasUnsavedSheet.value)

function requestSheetClose(kind: 'password' | 'phone' | 'deletion', visible: boolean) {
  if (visible) {
    if (kind === 'password') pwdVisible.value = true
    else if (kind === 'phone') phoneVisible.value = true
    else deletionVisible.value = true
    return
  }
  const dirty = kind === 'password'
    ? Boolean(pwdForm.oldPassword || pwdForm.password || pwdForm.confirm)
    : kind === 'phone'
      ? Boolean(phoneForm.phone || phoneForm.captchaCode)
      : Boolean(deletionReason.value.trim())
  const close = () => {
    if (kind === 'password') {
      pwdVisible.value = false
      Object.assign(pwdForm, { oldPassword: '', password: '', confirm: '' })
    } else if (kind === 'phone') {
      phoneVisible.value = false
      Object.assign(phoneForm, { phone: '', captchaCode: '' })
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
      <Cell title="修改登录密码" arrow @click="pwdVisible = true" />
      <Cell title="更换绑定手机号" arrow @click="phoneVisible = true" />
      <Cell title="找回密码说明" note="退出登录后可在登录页操作" arrow @click="router.push('/forgot-password')" />
    </CellGroup>

    <p class="group-title">隐私与数据</p>
    <CellGroup theme="card">
      <Cell title="用户协议与隐私政策" arrow @click="router.push('/privacy')" />
      <Cell title="导出个人数据" :note="requests.export ? `已生成（${formatLocalDateTime(requests.export.at)}），点击下载` : '生成后站内信通知'" arrow @click="onExport" />
      <Cell
        title="注销账号"
        :note="requests.deletion ? `申请处理中（${formatLocalDateTime(requests.deletion.at)}）` : ''"
        arrow
        @click="deletionVisible ? undefined : (deletionVisible = true)"
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
      <div class="sheet">
        <h2 class="sheet-title">修改登录密码</h2>
        <div class="field"><label>原密码</label><Input v-model="pwdForm.oldPassword" type="password" autocomplete="current-password" placeholder="请输入原密码…" clearable /><p v-if="pwdErrors.oldPassword" class="field-error">{{ pwdErrors.oldPassword }}</p></div>
        <div class="field"><label>新密码</label><Input v-model="pwdForm.password" type="password" autocomplete="new-password" placeholder="至少 8 位，含字母与数字…" clearable /><p v-if="pwdErrors.password" class="field-error">{{ pwdErrors.password }}</p></div>
        <div class="field"><label>确认新密码</label><Input v-model="pwdForm.confirm" type="password" autocomplete="new-password" placeholder="再次输入新密码…" clearable /><p v-if="pwdErrors.confirm" class="field-error">{{ pwdErrors.confirm }}</p></div>
        <Button theme="primary" size="large" block :loading="pwdSaving" @click="onPwdSave">保存</Button>
      </div>
    </Popup>

    <Popup :visible="phoneVisible" placement="bottom" :close-btn="true" @update:visible="requestSheetClose('phone', $event)">
      <div class="sheet">
        <h2 class="sheet-title">更换绑定手机号</h2>
        <div class="field"><label>新手机号</label><Input v-model="phoneForm.phone" type="tel" autocomplete="tel" :maxlength="11" placeholder="请输入新手机号…" clearable /><p v-if="phoneErrors.phone" class="field-error">{{ phoneErrors.phone }}</p></div>
        <CaptchaField v-model="phoneForm.captchaCode" label="图形验证码" :image="captchaImage" :loading="captchaLoading" clearable :error="phoneErrors.captchaCode" @refresh="refreshCaptcha" />
        <Button theme="primary" size="large" block :loading="phoneSaving" @click="onPhoneSave">确认更换</Button>
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

.group-title {
  margin:var(--app-space-5) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.empty-tip {
  margin:0;
  padding:var(--app-space-4) var(--app-space-1);
  font-size: var(--app-font-caption);
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
  font-size: var(--app-font-subtitle);
}

.sheet-tip {
  margin:0;
  font-size: var(--app-font-caption);
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

</style>
