<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ActionSheet, Avatar, Button, Cell, DialogPlugin, NoticeBar, Tag, Toast } from 'tdesign-mobile-vue'
import {
  applyEnterpriseExit,
  cancelEnterpriseTransfer,
  fetchEnterpriseDetail,
  inviteEnterpriseMember,
  revokeEnterpriseInvitation,
  transferEnterpriseContact,
} from '@/api/enterprises'
import { fetchExperience } from '@/api/experience'
import { fetchRealnameRights } from '@/api/me'
import { useAsyncList } from '@/composables/useAsyncList'
import { ApiError } from '@/api/http'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { formatLocalDateTime, parseLocalDateTime } from '@/utils/format'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import LevelCardCarousel from '@/components/level/LevelCardCarousel.vue'
import EnterpriseInviteSheet from '@/components/enterprise/EnterpriseInviteSheet.vue'
import EnterpriseMemberSection from '@/components/enterprise/EnterpriseMemberSection.vue'
import type { EnterpriseInvitation, EnterpriseMemberInfo, EnterpriseMemberPermission, ExperienceProfile, RealnameRightsGroup } from '@/types'

/* 企业详情 / 管理：企业名片入口 + 负责人 / 成员 / 退驻注销；
 * 负责人或持对应权限的成员可管理；成员管理与企业名片编辑均为独立页
 * （/me/enterprises/:id/members/:memberKey、/me/enterprises/:id/edit）。 */
const route = useRoute()
const router = useRouter()
const enterpriseId = String(route.params.id)
const businessNowMs = useBusinessNow()

const { data, loading, error, run } = useAsyncList(() => fetchEnterpriseDetail(enterpriseId))

/* ---- 企业等级（社区企业维度）：等级卡轮播 + 分级权益，全体成员可见 ---- */
const levelProfile = ref<ExperienceProfile | null>(null)
const levelRights = ref<RealnameRightsGroup[]>([])
const levelLoading = ref(false)
const levelError = ref('')
async function loadLevel() {
  levelLoading.value = true
  levelError.value = ''
  try {
    const [profile, rights] = await Promise.all([
      fetchExperience('community_enterprise', enterpriseId),
      fetchRealnameRights({ identityType: 'community_enterprise', enterpriseId }),
    ])
    levelProfile.value = profile
    levelRights.value = rights.slice().sort((a, b) => a.level - b.level)
  } catch (e) {
    levelError.value = e instanceof ApiError ? e.message : '企业等级信息加载失败'
  } finally {
    levelLoading.value = false
  }
}
onMounted(() => {
  run()
  void loadLevel()
})

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
/* v46：手机号仅对有管理权限者完整展示，其余按 138****8888 脱敏（与企业成员区口径一致，仅 UI 层处理）。 */
function maskPhone(value?: string): string {
  const phone = value ?? ''
  return /^\d{11}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone
}

const transferVisible = ref(false)
const transferCandidates = computed<EnterpriseMemberInfo[]>(() => (data.value?.members ?? []).filter((m) => !m.isContact))
const transferItems = computed(() =>
  transferCandidates.value.map((m) => ({
    label: `${m.name}${m.role ? ` · ${m.role}` : ''}`,
    description: m.phone ? (canManageMembers.value ? m.phone : maskPhone(m.phone)) : '',
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
function onRevokeInvitation(invitation: EnterpriseInvitation) {
  const invitationId = invitation.id
  const memberName = invitation.memberName
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
  const expires = parseLocalDateTime(expiresAt)
  if (!expires) return '有效期未知'
  const diff = expires.getTime() - businessNowMs.value
  if (diff <= 0) return '已过期'
  const days = Math.ceil(diff / 86400000)
  return `${days} 天内有效`
}

/* ---- 邀请企业成员（负责人；需指定职位） ---- */
const inviteVisible = ref(false)
const inviting = ref(false)

async function onInvite(payload: { name: string; phone: string; role: string }) {
  /* 入口已按权限隐藏，此处兜底拦截直连弹层提交（D-013） */
  if (!can('invite_member')) {
    Toast('你没有邀请成员的权限')
    inviteVisible.value = false
    return
  }
  inviting.value = true
  try {
    await inviteEnterpriseMember(enterpriseId, payload)
    Toast('邀请已发送，等待对方确认')
    inviteVisible.value = false
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '邀请失败，请稍后重试')
  } finally {
    inviting.value = false
  }
}

/* ---- 成员管理：跳转独立页（成员管理原为弹窗，内容较多无法上下滑动，v29 改为页面） ---- */
const canManageMembers = computed(() => can('manage_members') || can('assign_permission'))

function goMemberManage(m: EnterpriseMemberInfo) {
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
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="data">
      <section class="m-card">
        <div class="ent-head">
          <Avatar shape="round" size="56px" :image="data.logo" class="ent-logo">{{ data.enterpriseName.slice(0, 1) }}</Avatar>
          <div class="ent-info">
            <h2 class="ent-name">{{ data.enterpriseName }}</h2>
            <p class="ent-meta">
              {{ [data.industry, data.size, data.foundedAt ? `成立于 ${data.foundedAt}` : ''].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <Tag size="small" variant="light" :theme="isContact ? 'primary' : 'default'">{{ isContact ? '负责人' : '成员' }}</Tag>
        </div>
        <Cell
          v-pressable
          v-if="can('edit_card')"
          class="edit-cell"
          :bordered="false"
          title="编辑企业名片"
          arrow
          @click="goEditCard"
        />
      </section>

      <!-- 企业等级：社区企业维度的等级与分级权益轮播（全体成员可见） -->
      <section class="m-card level-section">
        <h2 class="sec-title">企业等级</h2>
        <ListSkeleton v-if="levelLoading" :rows="2" />
        <p v-else-if="levelError" class="level-error">
          {{ levelError }}
          <Button size="small" variant="text" theme="primary" @click="loadLevel">重试</Button>
        </p>
        <LevelCardCarousel
          v-else-if="levelRights.length"
          :groups="levelRights"
          :current-level="levelProfile?.level ?? null"
          :current-experience="levelProfile?.currentExperience ?? 0"
          :progress-percent="null"
          identity-label="社区企业"
        />
        <p v-else class="level-error">暂无企业等级权益配置</p>
      </section>

      <section class="m-card">
        <h2 class="sec-title">企业负责人</h2>
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
            :content="`负责人转移待 ${data.transferRequest.toName} 确认（${formatLocalDateTime(data.transferRequest.at)} 发起，${expiryText(data.transferRequest.expiresAt)}）`"
          />
          <div v-if="isContact" class="transfer-cancel">
            <Button size="small" variant="outline" @click="onCancelTransfer">撤销转移请求</Button>
          </div>
        </template>
      </section>

      <EnterpriseMemberSection
        :members="data.members"
        :invitations="data.invitations"
        :can-invite="can('invite_member')"
        :can-manage="canManageMembers"
        :hint="memberHint"
        @invite="inviteVisible = true"
        @revoke="onRevokeInvitation"
        @manage="goMemberManage"
      />

      <section v-if="isContact || data.exitApplication" class="m-card">
        <h2 class="sec-title">退驻 / 注销</h2>
        <template v-if="data.exitApplication && data.exitApplication.status === 'pending'">
          <NoticeBar visible theme="warning" :content="`退驻/注销申请处理中（提交于 ${formatLocalDateTime(data.exitApplication.at)}）`" />
          <p v-if="data.exitApplication.reason" class="exit-reason">申请说明：{{ data.exitApplication.reason }}</p>
        </template>
        <template v-else>
          <NoticeBar
            v-if="data.exitApplication && data.exitApplication.status === 'rejected'"
            visible
            theme="error"
            :content="`退驻/注销申请已被驳回（${formatLocalDateTime(data.exitApplication.at)}）${data.exitApplication.reason ? `：${data.exitApplication.reason}` : ''}`"
          />
          <p class="exit-desc">退驻后企业将失去社区企业身份与相关权益；注销后企业档案将被归档。提交后由社区运营审核确认。</p>
          <Button theme="danger" variant="outline" block @click="onExitApply">申请退驻 / 注销</Button>
        </template>
      </section>
    </template>

    <!-- TDesign 该版本 ActionSheet 只发 update:modelValue（cancel/close 不触发），用 v-model 才能
         让取消/点遮罩关闭生效 -->
    <ActionSheet
      v-model="transferVisible"
      :items="transferItems"
      description="选择新的企业负责人（仅企业成员）"
      cancel-text="取消"
      :popup-props="{ closeOnOverlayClick: true }"
      @selected="onTransferSelected"
    />

    <EnterpriseInviteSheet v-if="can('invite_member')" v-model:visible="inviteVisible" :submitting="inviting" @submit="onInvite" />

  </div>
</template>

<style scoped>
.m-enterprise {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.ent-head {
  display: flex;
  align-items: center;
  gap:var(--app-space-6);
}

.ent-logo {
  flex-shrink: 0;
  font: var(--app-type-display);
}

.ent-info {
  flex: 1;
  min-width: 0;
}

.ent-name {
  margin:0 0 var(--app-space-2);
  font: var(--app-type-page-title);
}

.ent-meta {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.edit-cell {
  margin-top:var(--app-space-6);
  padding:var(--app-space-6) 0 0;
  border-top: 1px dashed var(--td-component-border);
}

.sec-title {
  margin:0 0 var(--app-space-6);
  font: var(--app-type-section);
}

.level-section {
  margin-bottom: 0;
}

.level-error {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.contact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-5);
}

.transfer-cancel {
  display: flex;
  justify-content: flex-end;
  margin-top:var(--app-space-5);
}

.contact-name {
  margin:0 0 var(--app-space-2);
  font: var(--app-type-card-title);
}

.contact-hint {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.exit-desc {
  margin:0 0 var(--app-space-6);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.exit-reason {
  margin:var(--app-space-4) 0 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

</style>
