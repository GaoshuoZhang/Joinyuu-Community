<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Cell, CellGroup, DialogPlugin, Input, Popup, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { changePhone } from '@/api/auth'
import { cancelAccountDeletion, changePassword, downloadPersonalData, fetchAccountRequests, listBlockedUsers, listMyReports, requestAccountDeletion, requestDataExport, unblockUser } from '@/api/me'
import { ApiError } from '@/api/http'
import type { ReportPayload } from '@/types'
import { useCaptcha } from '@/composables/useCaptcha'

/* 账号与安全（v38 [MOCK-ONLY]）：修改密码 / 更换手机号 / 注销申请 / 数据导出 / 我的举报 / 屏蔽名单。
 * 接入期对应后端缺口：短信通道、注销复核流程、数据导出任务、举报处理状态回写。 */
const router = useRouter()
const { captchaId, captchaImage, captchaLoading, refreshCaptcha } = useCaptcha()

const requests = ref<{ deletion?: { reason?: string; at: string; cancelableUntil?: string }; export?: { at: string; url?: string } }>({})
const reports = ref<(ReportPayload & { id: string; at: string; status: 'pending' | 'resolved' | 'rejected' })[]>([])
const blocked = ref<{ uid: string; name: string }[]>([])

async function loadAll() {
  const [req, rep, blk] = await Promise.all([
    fetchAccountRequests().catch(() => ({})),
    listMyReports().catch(() => []),
    listBlockedUsers().catch(() => []),
  ])
  requests.value = req
  reports.value = rep
  blocked.value = blk
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
    phoneErrors.phone = '请输入正确的手机号'
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

/* ---- 屏蔽名单 ---- */
function onUnblock(uid: string, name: string) {
  DialogPlugin.confirm({
    title: '解除屏蔽',
    content: `确认解除对「${name}」的屏蔽？`,
    cancelBtn: '取消',
    confirmBtn: '解除',
    onConfirm: async () => {
      try {
        await unblockUser(uid)
        Toast('已解除屏蔽')
        await loadAll()
      } catch (e) {
        Toast(e instanceof ApiError ? e.message : '操作失败，请稍后重试')
      }
    },
  })
}

const REPORT_STATUS: Record<string, string> = { pending: '处理中', resolved: '已处理', rejected: '未采纳' }
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
      <Cell title="导出个人数据" :note="requests.export ? `已生成（${requests.export.at}），点击下载` : '生成后站内信通知'" arrow @click="onExport" />
      <Cell
        title="注销账号"
        :note="requests.deletion ? `申请处理中（${requests.deletion.at}）` : ''"
        arrow
        @click="deletionVisible ? undefined : (deletionVisible = true)"
      />
    </CellGroup>

    <div v-if="requests.deletion" class="cooling m-card">
      <p class="cooling-text">
        注销申请处理中（{{ requests.deletion.at }} 提交）<template v-if="requests.deletion.cancelableUntil">，{{ requests.deletion.cancelableUntil }} 前可撤回</template>
      </p>
      <Button size="small" variant="outline" :loading="cancelDeleting" @click="onCancelDeletion">撤回注销申请</Button>
    </div>

    <p class="group-title">我的举报（{{ reports.length }}）</p>
    <CellGroup v-if="reports.length" theme="card">
      <Cell
        v-for="item in reports"
        :key="item.id"
        :title="item.targetTitle || item.targetId"
        :note="`${item.reason} · ${item.at}`"
      >
        <template #right-icon>
          <Tag size="small" variant="light" :theme="item.status === 'pending' ? 'warning' : item.status === 'resolved' ? 'success' : 'default'">
            {{ REPORT_STATUS[item.status] ?? item.status }}
          </Tag>
        </template>
      </Cell>
    </CellGroup>
    <p v-else class="empty-tip">暂无举报记录</p>

    <p class="group-title">屏蔽名单（{{ blocked.length }}）</p>
    <CellGroup v-if="blocked.length" theme="card">
      <Cell v-for="item in blocked" :key="item.uid" :title="item.name" :note="item.uid" arrow @click="onUnblock(item.uid, item.name)" />
    </CellGroup>
    <p v-else class="empty-tip">暂无屏蔽用户，可在人才名片中屏蔽</p>

    <Popup v-model:visible="pwdVisible" placement="bottom">
      <div class="sheet">
        <h3 class="sheet-title">修改登录密码</h3>
        <div class="field"><label>原密码</label><Input v-model="pwdForm.oldPassword" type="password" placeholder="请输入原密码" clearable /><p v-if="pwdErrors.oldPassword" class="field-error">{{ pwdErrors.oldPassword }}</p></div>
        <div class="field"><label>新密码</label><Input v-model="pwdForm.password" type="password" placeholder="至少 8 位，含字母与数字" clearable /><p v-if="pwdErrors.password" class="field-error">{{ pwdErrors.password }}</p></div>
        <div class="field"><label>确认新密码</label><Input v-model="pwdForm.confirm" type="password" placeholder="再次输入新密码" clearable /><p v-if="pwdErrors.confirm" class="field-error">{{ pwdErrors.confirm }}</p></div>
        <Button theme="primary" size="large" block :loading="pwdSaving" @click="onPwdSave">保存</Button>
      </div>
    </Popup>

    <Popup v-model:visible="phoneVisible" placement="bottom">
      <div class="sheet">
        <h3 class="sheet-title">更换绑定手机号</h3>
        <div class="field"><label>新手机号</label><Input v-model="phoneForm.phone" type="tel" :maxlength="11" placeholder="请输入新手机号" clearable /><p v-if="phoneErrors.phone" class="field-error">{{ phoneErrors.phone }}</p></div>
        <div class="field"><label>图形验证码</label><div class="captcha-row"><Input v-model="phoneForm.captchaCode" :maxlength="4" placeholder="请输入验证码" clearable /><button class="captcha-button" type="button" :disabled="captchaLoading" aria-label="刷新验证码" @click="refreshCaptcha"><img v-if="captchaImage" :src="captchaImage" alt="图形验证码" /><span v-else>刷新</span></button></div><p v-if="phoneErrors.captchaCode" class="field-error">{{ phoneErrors.captchaCode }}</p></div>
        <Button theme="primary" size="large" block :loading="phoneSaving" @click="onPhoneSave">确认更换</Button>
      </div>
    </Popup>

    <Popup v-model:visible="deletionVisible" placement="bottom">
      <div class="sheet">
        <h3 class="sheet-title">注销账号</h3>
        <p class="sheet-tip">提交后社区运营将与你确认；注销后身份、积分与内容将按合规要求处理。可填写原因帮助我们改进：</p>
        <Textarea v-model="deletionReason" :autosize="{ minRows: 3, maxRows: 6 }" :maxlength="200" placeholder="注销原因（选填）…" />
        <Button theme="danger" size="large" block @click="onDeletionApply">提交注销申请</Button>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.m-security {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* v43：CellGroup 自带左右 16px 外边距，与页面 padding 叠加会导致卡片偏窄 */
.m-security :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}

.group-title {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.empty-tip {
  margin: 0;
  padding: 8px 2px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.sheet-title {
  margin: 0;
  font-size: 15px;
}

.sheet-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.captcha-row { display: flex; align-items: center; gap: 10px; }
.captcha-row :deep(.t-input) { flex: 1; min-width: 0; }
.captcha-button { min-width: 96px; min-height: 40px; padding: 0; border: 0; border-radius: var(--td-radius-default); overflow: hidden; }
.captcha-button img { display: block; width: 96px; height: 40px; }
</style>
