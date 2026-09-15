<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, Cell, Loading, NoticeBar, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchInvitation, respondInvitation } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { EnterpriseInvitation, InvitationAction } from '@/types'

/* 企业邀请详情（[MOCK-ONLY] 缺口 §7.1-17）：被邀请人确认加入 / 拒绝；
 * 接受后写入企业成员并通知负责人；入口为站内信通知链接（/me/invitations/:id）。 */
const route = useRoute()
const router = useRouter()
const invitationId = String(route.params.id)

const { data, loading, error, run } = useAsyncList(() => fetchInvitation(invitationId))
onMounted(run)

type TagTheme = 'default' | 'primary' | 'success' | 'warning' | 'danger'
const STATUS: Record<EnterpriseInvitation['status'], { label: string; theme: TagTheme }> = {
  pending: { label: '待接受', theme: 'warning' },
  accepted: { label: '已加入', theme: 'success' },
  rejected: { label: '已拒绝', theme: 'default' },
}
const statusTag = computed(() => STATUS[data.value?.status ?? 'pending'])

const responding = ref(false)
async function onRespond(action: InvitationAction) {
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
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <template v-else-if="data">
      <section class="m-card ent">
        <Avatar shape="round" size="56px" :image="data.enterpriseLogo" class="ent-logo">
          {{ data.enterpriseName.slice(0, 1) }}
        </Avatar>
        <div class="ent-info">
          <h3 class="ent-name">{{ data.enterpriseName }}</h3>
          <p class="ent-meta">{{ [data.enterpriseIndustry, data.enterpriseSize].filter(Boolean).join(' · ') }}</p>
        </div>
        <Tag size="small" variant="light" :theme="statusTag.theme">{{ statusTag.label }}</Tag>
      </section>

      <section class="m-card">
        <h3 class="sec-title">邀请信息</h3>
        <Cell title="邀请人" :note="data.inviterName" :bordered="false" />
        <Cell title="受邀成员" :note="data.memberName" :bordered="false" />
        <Cell title="联系电话" :note="data.phone" :bordered="false" />
        <Cell title="加入后职位" :note="data.role" :bordered="false" />
        <Cell title="邀请时间" :note="data.at" :bordered="false" />
        <Cell v-if="data.respondedAt" title="处理时间" :note="data.respondedAt" :bordered="false" />
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
        <p class="result-tip">
          {{ data.status === 'accepted' ? `你已加入「${data.enterpriseName}」，可在「我的 → 关联身份」查看。` : '你已拒绝该邀请，如为误操作可联系企业负责人重新邀请。' }}
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.m-invitation {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.ent {
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

.sec-title {
  margin: 0 0 6px;
  font-size: 14px;
}

.result-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  text-align: center;
}
</style>
