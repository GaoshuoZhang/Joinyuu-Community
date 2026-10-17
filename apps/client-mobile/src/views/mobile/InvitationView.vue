<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, Cell, NoticeBar, Toast } from 'tdesign-mobile-vue'
import { confirmDialog } from '@/utils/confirmDialog'
import { fetchInvitation, respondInvitation } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { InvitationAction } from '@/types'
import { formatLocalDateTime } from '@/utils/format'

/* 企业邀请详情：被邀请人确认加入 / 拒绝；
 * 接受后写入企业成员并通知负责人；入口为站内信通知链接（/me/invitations/:id）。 */
const route = useRoute()
const router = useRouter()
const invitationId = String(route.params.id)

const { data, loading, error, run } = useAsyncList(() => fetchInvitation(invitationId))
onMounted(run)

/* 终态结尾文案按状态区分：撤销/过期与「已拒绝」不是一回事，避免同屏与状态标签自相矛盾 */
const resultTip = computed(() => {
  const invitation = data.value
  if (!invitation) return ''
  switch (invitation.status) {
    case 'accepted':
      return `你已加入「${invitation.enterpriseName}」，可在「我的 → 关联身份」查看。`
    case 'rejected':
      return '你已拒绝该邀请，如为误操作可联系企业负责人重新邀请。'
    case 'revoked':
      return '邀请已被企业撤销。'
    case 'expired':
      return '邀请已过期，请联系企业负责人重新邀请。'
    default:
      return ''
  }
})

const responding = ref(false)

function onRespond(action: InvitationAction) {
  if (responding.value) return
  if (action === 'reject') {
    confirmDialog({
      title: '拒绝邀请',
      content: `确认拒绝加入「${data.value?.enterpriseName ?? '该企业'}」？如为误操作需企业负责人重新邀请。`,
      cancelBtn: '再想想',
      confirmBtn: '确认拒绝',
      onConfirm: () => {
        void doRespond('reject')
      },
    })
    return
  }
  /* 确认加入会写入企业成员（不可逆，退出需联系负责人），与「拒绝」同样需要二次确认 */
  confirmDialog({
    title: '确认加入',
    content: `确认以「${data.value?.role ?? '成员'}」身份加入「${data.value?.enterpriseName ?? '该企业'}」？加入后你的成员信息将出现在企业名片中。`,
    cancelBtn: '再想想',
    confirmBtn: '确认加入',
    onConfirm: () => {
      void doRespond('accept')
    },
  })
}

async function doRespond(action: InvitationAction) {
  if (responding.value) return
  responding.value = true
  try {
    await respondInvitation(invitationId, action)
    Toast(action === 'accept' ? `已加入「${data.value?.enterpriseName}」` : '已拒绝该邀请')
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '操作失败，请稍后重试')
  } finally {
    responding.value = false
  }
}

function goEnterprise() {
  if (data.value?.enterpriseId) void router.push(`/me/enterprises/${data.value.enterpriseId}`)
}
</script>

<template>
  <div class="page-fade-in m-invitation">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="data">
      <section class="m-card ent">
        <Avatar shape="round" size="56px" :image="data.enterpriseLogo" class="ent-logo">
          {{ data.enterpriseName.slice(0, 1) }}
        </Avatar>
        <div class="ent-info">
          <h2 class="ent-name">{{ data.enterpriseName }}</h2>
          <p class="ent-meta">{{ [data.enterpriseIndustry, data.enterpriseSize].filter(Boolean).join(' · ') }}</p>
        </div>
        <StateTag kind="invitation" :value="data.status" />
      </section>

      <section class="m-card">
        <h2 class="sec-title">邀请信息</h2>
        <Cell title="邀请人" :note="data.inviterName" :bordered="false" />
        <Cell title="受邀成员" :note="data.memberName" :bordered="false" />
        <Cell title="联系电话" :note="data.phone" :bordered="false" />
        <Cell title="加入后职位" :note="data.role" :bordered="false" />
        <Cell title="邀请时间" :note="formatLocalDateTime(data.at)" :bordered="false" />
        <Cell v-if="data.expiresAt" title="有效期至" :note="formatLocalDateTime(data.expiresAt)" :bordered="false" />
        <Cell v-if="data.respondedAt" title="处理时间" :note="formatLocalDateTime(data.respondedAt)" :bordered="false" />
      </section>

      <template v-if="data.status === 'pending'">
        <NoticeBar
          visible
          theme="info"
          content="确认加入后，你将以成员身份出现在企业名片中，可在「我的 → 关联身份」查看。"
        />
        <Button theme="primary" size="large" block :loading="responding" @click="onRespond('accept')">确认加入</Button>
        <Button theme="danger" variant="outline" size="large" block :disabled="responding" @click="onRespond('reject')">
          拒绝邀请
        </Button>
      </template>
      <template v-else>
        <Button v-if="data.status === 'accepted'" theme="primary" variant="outline" size="large" block @click="goEnterprise">
          查看企业详情
        </Button>
        <p class="result-tip">{{ resultTip }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.m-invitation {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.ent {
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

.sec-title {
  margin:0 0 var(--app-space-3);
  /* 与全站同名章节标题（企业详情 / 人才名片 / 活动详情）统一为 section 角色档 */
  font: var(--app-type-section);
}

.result-tip {
  margin:0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
  text-align: center;
}
</style>
