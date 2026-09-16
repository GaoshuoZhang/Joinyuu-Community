<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Loading, Button, DialogPlugin, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchMyIdentities, fetchMyTransferRequests, respondEnterpriseTransfer } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { EnterpriseTransferRequest, MyIdentitySummary } from '@/types'

/* 关联身份：社区个体 + 我关联的社区企业/合作企业（可多个）；
 * 点入后按该身份查看/操作（社区个体 → 个人名片；企业 → 详情，负责人可编辑、成员只读）；
 * v35 顶部展示待确认的负责人转移请求（接受后成为负责人）。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyIdentities)

const transfers = ref<EnterpriseTransferRequest[]>([])

onMounted(async () => {
  await run()
  await loadTransfers()
})

async function loadTransfers() {
  try {
    transfers.value = await fetchMyTransferRequests()
  } catch {
    transfers.value = []
  }
}

function onRespond(item: EnterpriseTransferRequest, action: 'accept' | 'reject') {
  DialogPlugin.confirm({
    title: action === 'accept' ? '接受负责人转移' : '拒绝负责人转移',
    content:
      action === 'accept'
        ? `接受后你将成为「${item.enterpriseName}」的企业负责人，可管理企业信息与成员。`
        : `确认拒绝「${item.fromName}」发起的「${item.enterpriseName}」负责人转移请求？`,
    cancelBtn: '取消',
    confirmBtn: action === 'accept' ? '确认接受' : '确认拒绝',
    onConfirm: async () => {
      try {
        await respondEnterpriseTransfer(item.id, action)
        Toast(action === 'accept' ? '已成为企业负责人' : '已拒绝转移请求')
        await loadTransfers()
        await run()
      } catch (e) {
        Toast(e instanceof Error ? e.message : '处理失败，请稍后重试')
      }
    },
  })
}

function onTap(item: MyIdentitySummary) {
  if (item.type === 'community_individual') {
    void router.push('/me/cards/individual')
    return
  }
  if (item.enterpriseId) void router.push(`/me/enterprises/${item.enterpriseId}`)
}
</script>

<template>
  <div class="page-fade-in m-identities">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else>
      <section v-if="transfers.length" class="transfer-block">
        <h3 class="transfer-title">待确认的负责人转移</h3>
        <article v-for="item in transfers" :key="item.id" class="m-card transfer-card">
          <p class="transfer-ent">{{ item.enterpriseName }}</p>
          <p class="transfer-desc">{{ item.fromName }} 邀请你接任企业负责人（{{ item.at }} 发起）</p>
          <div class="transfer-actions">
            <Button size="small" theme="primary" @click="onRespond(item, 'accept')">接受</Button>
            <Button size="small" variant="outline" @click="onRespond(item, 'reject')">拒绝</Button>
          </div>
        </article>
      </section>

      <EmptyBlock v-if="!data?.length" text="暂无关联身份" />
      <div v-else class="stagger list">
        <article
          v-for="item in data"
          :key="item.key"
          class="m-card id-card" v-pressable
          :class="{ linkable: item.type === 'community_individual' || item.enterpriseId }"
          @click="onTap(item)"
        >
          <div class="id-head">
            <span class="id-label">{{ item.label }}</span>
            <Tag v-if="item.roleLabel" size="small" variant="light" :theme="item.isContact ? 'primary' : 'default'">
              {{ item.roleLabel }}
            </Tag>
            <Tag v-else size="small" variant="light" theme="primary">个人名片</Tag>
          </div>
          <p class="id-name">{{ item.name }}</p>
          <p v-if="item.subtitle" class="id-sub">{{ item.subtitle }}</p>
          <p class="id-foot">
            <span v-if="item.type === 'community_individual'" class="entry">查看 / 编辑个人名片</span>
            <span v-else :class="item.showcaseStatus === 'published' ? 'ok' : 'off'">
              {{ item.showcaseStatus === 'published' ? '名片已发布' : '名片未发布' }}
            </span>
            <span v-if="item.type === 'community_individual' || item.enterpriseId" class="arrow">›</span>
          </p>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.m-identities {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.transfer-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transfer-title {
  margin: 0;
  font-size: 14px;
}

.transfer-ent {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.transfer-desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.transfer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.id-card.linkable {
  cursor: pointer;
}

.id-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.id-label {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.id-name {
  margin: 8px 0 0;
  font-size: 15px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.id-sub {
  margin: 5px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.id-foot {
  margin: 8px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.id-foot .entry {
  color: var(--td-text-color-secondary);
}

.id-foot .ok {
  color: var(--td-success-color);
}

.id-foot .off {
  color: var(--td-text-color-placeholder);
}

.id-foot .arrow {
  color: var(--td-text-color-placeholder);
  font-size: 16px;
}
</style>
