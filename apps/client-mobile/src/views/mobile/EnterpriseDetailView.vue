<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, ActionSheet, Avatar, Button, Cell, DialogPlugin, Input, NoticeBar, Popup, Tag, Toast } from 'tdesign-mobile-vue'
import {
  applyEnterpriseExit,
  cancelEnterpriseTransfer,
  fetchEnterpriseDetail,
  inviteEnterpriseMember,
  revokeEnterpriseInvitation,
  transferEnterpriseContact,
} from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import { formatMockStamp, parseMockStamp } from '@/mock/runtime'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { EnterpriseMemberInfo, EnterpriseMemberPermission } from '@/types'

/* 企业详情 / 管理（[MOCK-ONLY]，缺口 §7.1-16/17）：企业名片入口 + 负责人 / 成员 / 退驻注销；
 * 负责人或持对应权限的成员可管理；成员管理与企业名片编辑均为独立页
 * （/me/enterprises/:id/members/:memberKey、/me/enterprises/:id/edit）。 */
const route = useRoute()
const router = useRouter()
const enterpriseId = String(route.params.id)

const { data, loading, error, run } = useAsyncList(() => fetchEnterpriseDetail(enterpriseId))
onMounted(run)

const isContact = computed(() => data.value?.isContact === true)
const myPermissions = computed<EnterpriseMemberPermission[]>(() => data.value?.myPermissions ?? [])
/** 是否具备某企业权限（负责人默认全部） */
function can(perm: EnterpriseMemberPermission): boolean {
  return isContact.value || myPermissions.value.includes(perm)
}

/** 成员操作提示（按我的权限展示） */
const memberHint = computed(() => {
  if (!can('manage_members') && !can('assign_permission')) return ''
  const parts: string[] = []
  if (can('manage_members')) parts.push('职位、手机号')
  if (can('assign_permission')) parts.push('权限')
  return `点击成员进入成员管理（${parts.join(' · ')}）`
})

function goEditCard() {
  void router.push(`/me/enterprises/${enterpriseId}/edit`)
}

/* ---- 转移企业负责人（负责人） ---- */
const transferVisible = ref(false)
const transferCandidates = computed<EnterpriseMemberInfo[]>(() => (data.value?.members ?? []).filter((m) => !m.isContact))
const transferItems = computed(() =>
  transferCandidates.value.map((m) => ({
    label: `${m.name}${m.role ? ` · ${m.role}` : ''}`,
    description: m.phone ?? '',
  })),
)

function onTransferSelected(_selected: unknown, index: number) {
  transferVisible.value = false
  const member = transferCandidates.value[index]
  if (!member) return
  DialogPlugin.confirm({
    title: '转移企业负责人',
    content: `将向 ${member.name} 发送「${data.value?.enterpriseName}」负责人转移请求，对方接受后生效。`,
    cancelBtn: '取消',
    confirmBtn: '发送请求',
    onConfirm: () => {
      void doTransfer(member)
    },
  })
}

async function doTransfer(member: EnterpriseMemberInfo) {
  try {
    await transferEnterpriseContact(enterpriseId, { memberUid: member.uid, memberName: member.name })
    Toast('转移请求已发送，等待对方确认')
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '转移失败，请稍后重试')
  }
}

/* v35：撤销待确认的负责人转移请求 */
function onCancelTransfer() {
  const request = data.value?.transferRequest
  if (!request) return
  DialogPlugin.confirm({
    title: '撤销转移请求',
    content: `撤销后「${request.toName}」将无法接受该负责人转移请求。`,
    cancelBtn: '取消',
    confirmBtn: '确认撤销',
    onConfirm: async () => {
      try {
        await cancelEnterpriseTransfer(request.id)
        Toast('已撤销转移请求')
        await run()
      } catch (e) {
        Toast(e instanceof ApiError ? e.message : '撤销失败，请稍后重试')
      }
    },
  })
}

/* v35：撤销待接受的成员邀请 */
function onRevokeInvitation(invitationId: string, memberName: string) {
  DialogPlugin.confirm({
    title: '撤销邀请',
    content: `确认撤销对 ${memberName} 的成员邀请？`,
    cancelBtn: '取消',
    confirmBtn: '确认撤销',
    onConfirm: async () => {
      try {
        await revokeEnterpriseInvitation(invitationId)
        Toast('已撤销邀请')
        await run()
      } catch (e) {
        Toast(e instanceof ApiError ? e.message : '撤销失败，请稍后重试')
      }
    },
  })
}

function expiryText(expiresAt?: string): string {
  if (!expiresAt) return '7 天内有效'
  const diff = parseMockStamp(expiresAt).getTime() - parseMockStamp(formatMockStamp()).getTime()
  if (diff <= 0) return '已过期'
  const days = Math.ceil(diff / 86400000)
  return `${days} 天内有效`
}

/* ---- 邀请企业成员（负责人；需指定职位） ---- */
const inviteVisible = ref(false)
const inviteForm = reactive({ name: '', phone: '', role: '' })
/* v40：邀请表单行内错误 */
const inviteErrors = reactive({ name: '', phone: '', role: '' })
watch(() => inviteForm.name, () => (inviteErrors.name = ''))
watch(() => inviteForm.phone, () => (inviteErrors.phone = ''))
watch(() => inviteForm.role, () => (inviteErrors.role = ''))
const inviting = ref(false)

async function onInvite() {
  inviteErrors.name = ''
  inviteErrors.phone = ''
  inviteErrors.role = ''
  if (!inviteForm.name.trim()) {
    inviteErrors.name = '请输入成员姓名'
    Toast(inviteErrors.name)
    return
  }
  if (!/^1\d{10}$/.test(inviteForm.phone.trim())) {
    inviteErrors.phone = '请输入正确的手机号'
    Toast(inviteErrors.phone)
    return
  }
  if (!inviteForm.role.trim()) {
    inviteErrors.role = '请输入成员职位'
    Toast(inviteErrors.role)
    return
  }
  inviting.value = true
  try {
    await inviteEnterpriseMember(enterpriseId, {
      name: inviteForm.name.trim(),
      phone: inviteForm.phone.trim(),
      role: inviteForm.role.trim(),
    })
    Toast('邀请已发送，等待对方确认')
    inviteVisible.value = false
    inviteForm.name = ''
    inviteForm.phone = ''
    inviteForm.role = ''
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '邀请失败，请稍后重试')
  } finally {
    inviting.value = false
  }
}

/* ---- 成员管理：跳转独立页（成员管理原为弹窗，内容较多无法上下滑动，v29 改为页面） ---- */
function canManageMembers(m: EnterpriseMemberInfo): boolean {
  return !m.isContact && (can('manage_members') || can('assign_permission'))
}

function goMemberManage(m: EnterpriseMemberInfo) {
  if (!canManageMembers(m)) return
  const key = m.uid ?? m.name
  void router.push(`/me/enterprises/${enterpriseId}/members/${encodeURIComponent(key)}`)
}

/* ---- 申请退驻 / 注销（负责人） ---- */
function onExitApply() {
  DialogPlugin.confirm({
    title: '申请退驻 / 注销',
    content: '提交后社区运营将在 3 个工作日内与你联系确认。确认提交申请吗？',
    cancelBtn: '再想想',
    confirmBtn: '提交申请',
    onConfirm: () => {
      void doExit()
    },
  })
}

async function doExit() {
  try {
    await applyEnterpriseExit(enterpriseId, {})
    Toast('退驻/注销申请已提交')
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  }
}
</script>

<template>
  <div class="page-fade-in m-enterprise">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="data">
      <section class="m-card">
        <div class="ent-head">
          <Avatar shape="round" size="56px" :image="data.logo" class="ent-logo">{{ data.enterpriseName.slice(0, 1) }}</Avatar>
          <div class="ent-info">
            <h3 class="ent-name">{{ data.enterpriseName }}</h3>
            <p class="ent-meta">
              {{ [data.industry, data.size, data.foundedAt ? `成立于 ${data.foundedAt}` : ''].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <Tag size="small" variant="light" :theme="isContact ? 'primary' : 'default'">{{ isContact ? '负责人' : '成员' }}</Tag>
        </div>
        <Cell
          v-if="can('edit_card')"
          class="edit-cell"
          :bordered="false"
          title="编辑企业名片"
          :note="data.showcaseStatus === 'published' ? '名片已发布' : '名片未发布'"
          arrow
          @click="goEditCard"
        />
      </section>

      <section class="m-card">
        <h3 class="sec-title">企业负责人</h3>
        <div class="contact-row">
          <div class="contact-info">
            <p class="contact-name">{{ data.contactName ?? '—' }}</p>
            <p class="contact-hint">负责管理企业名片与成员</p>
          </div>
          <Button
            v-if="isContact && !data.transferRequest"
            theme="primary"
            variant="outline"
            size="small"
            :disabled="transferCandidates.length === 0"
            @click="transferVisible = true"
          >
            转移负责人
          </Button>
        </div>
        <template v-if="data.transferRequest">
          <NoticeBar
            visible
            theme="warning"
            :content="`负责人转移待 ${data.transferRequest.toName} 确认（${data.transferRequest.at} 发起，${expiryText(data.transferRequest.expiresAt)}）`"
          />
          <div class="transfer-cancel">
            <Button size="small" variant="outline" @click="onCancelTransfer">撤销转移请求</Button>
          </div>
        </template>
      </section>

      <section class="m-card">
        <div class="sec-head">
          <h3 class="sec-title no-margin">企业成员（{{ data.members.length }}）</h3>
          <Button v-if="can('invite_member')" theme="primary" size="small" @click="inviteVisible = true">邀请成员</Button>
        </div>
        <div v-if="data.invitations.length" class="invites">
          <p class="members-hint">待接受邀请（{{ data.invitations.length }}）</p>
          <Cell
            v-for="inv in data.invitations"
            :key="inv.id"
            :title="inv.memberName"
            :note="[inv.role, inv.phone, inv.status === 'expired' ? '已过期' : '待对方确认'].filter(Boolean).join(' · ')"
            :bordered="false"
          >
            <template #right-icon>
              <Tag v-if="inv.status === 'expired'" size="small" variant="light" theme="default">已过期</Tag>
              <Button
                v-else-if="can('invite_member')"
                size="small"
                variant="outline"
                @click.stop="onRevokeInvitation(inv.id, inv.memberName)"
              >
                撤销
              </Button>
            </template>
          </Cell>
        </div>
        <div class="members">
          <Cell
            v-for="m in data.members"
            :key="m.phone ?? m.name"
            :title="m.name"
            :note="[m.role, m.phone].filter(Boolean).join(' · ')"
            :bordered="false"
            :arrow="canManageMembers(m)"
            @click="canManageMembers(m) ? goMemberManage(m) : undefined"
          >
            <template #right-icon>
              <Tag v-if="m.isContact" size="small" variant="light" theme="primary">负责人</Tag>
            </template>
          </Cell>
        </div>
        <p v-if="memberHint" class="members-hint">{{ memberHint }}</p>
      </section>

      <section v-if="isContact || data.exitApplication" class="m-card">
        <h3 class="sec-title">退驻 / 注销</h3>
        <template v-if="data.exitApplication">
          <NoticeBar visible theme="warning" :content="`退驻/注销申请处理中（提交于 ${data.exitApplication.at}）`" />
          <p v-if="data.exitApplication.reason" class="exit-reason">申请说明：{{ data.exitApplication.reason }}</p>
        </template>
        <template v-else>
          <p class="exit-desc">退驻后企业将失去社区企业身份与相关权益；注销后企业档案将被归档。提交后由社区运营审核确认。</p>
          <Button theme="danger" variant="outline" block @click="onExitApply">申请退驻 / 注销</Button>
        </template>
      </section>
    </template>

    <ActionSheet
      v-model:visible="transferVisible"
      :items="transferItems"
      description="选择新的企业负责人（仅企业成员）"
      cancel-text="取消"
      :popup-props="{ closeOnOverlayClick: true }"
      @close="transferVisible = false"
      @cancel="transferVisible = false"
      @selected="onTransferSelected"
    />

    <Popup v-model:visible="inviteVisible" placement="bottom">
      <div class="popup-body">
        <h3 class="popup-title">邀请企业成员</h3>
        <div class="field">
          <label>成员姓名</label>
          <Input v-model="inviteForm.name" :maxlength="20" placeholder="请输入成员姓名" clearable /><p v-if="inviteErrors.name" class="field-error">{{ inviteErrors.name }}</p>
        </div>
        <div class="field">
          <label>手机号</label>
          <Input v-model="inviteForm.phone" type="tel" :maxlength="11" placeholder="请输入 11 位手机号" clearable /><p v-if="inviteErrors.phone" class="field-error">{{ inviteErrors.phone }}</p>
        </div>
        <div class="field">
          <label>职位</label>
          <Input v-model="inviteForm.role" :maxlength="20" placeholder="如：产品负责人 / 设计总监" clearable /><p v-if="inviteErrors.role" class="field-error">{{ inviteErrors.role }}</p>
        </div>
        <Button theme="primary" size="large" block :loading="inviting" @click="onInvite">
          {{ inviting ? '发送中…' : '发送邀请' }}
        </Button>
      </div>
    </Popup>

  </div>
</template>

<style scoped>
.m-enterprise {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.ent-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ent-logo {
  flex-shrink: 0;
  font-size: 20px;
  font-weight: 700;
}

.ent-info {
  flex: 1;
  min-width: 0;
}

.ent-name {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
}

.ent-meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.edit-cell {
  margin-top: 12px;
  padding: 12px 0 0;
  border-top: 1px dashed var(--td-component-border);
}

.sec-title {
  margin: 0 0 12px;
  font-size: 15px;
}

.sec-title.no-margin {
  margin: 0;
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.field {
  margin-bottom: 15px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.contact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.transfer-cancel {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.contact-name {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
}

.contact-hint {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.members :deep(.t-cell) {
  padding-left: 0;
  padding-right: 0;
}

.members-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.exit-desc {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.exit-reason {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.popup-body {
  box-sizing: border-box;
  width: 100%;
  padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large) var(--td-radius-large) 0 0;
}

.popup-title {
  margin: 0 0 16px;
  font-size: 17px;
}

.remove-btn {
  margin-top: 12px;
}

.popup-tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  text-align: center;
}

.perm-tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}
</style>
