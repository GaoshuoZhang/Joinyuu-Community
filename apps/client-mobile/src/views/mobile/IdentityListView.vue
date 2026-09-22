<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, DialogPlugin, Icon, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchMyIdentities, fetchMyTransferRequests, respondEnterpriseTransfer } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { EnterpriseTransferRequest, MyIdentitySummary } from '@/types'
import { formatLocalDateTime } from '@/utils/format'

/* 关联身份：社区个体 + 我关联的社区企业/合作企业（可多个）；
 * 点入后按该身份查看/操作（社区个体 → 个人名片；企业 → 详情，负责人可编辑、成员只读）；
 * v35 顶部展示待确认的负责人转移请求（接受后成为负责人）；
 * v49 支持 ?filter=enterprise 只看企业身份（首页「企业管理」入口），底部补「企业合作」入口。 */
const route = useRoute()
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyIdentities)

const isEnterpriseType = (item: MyIdentitySummary) =>
  item.type === 'community_enterprise' || item.type === 'external_enterprise'

/* 仅企业身份视图：进入时过滤掉社区个体/个人身份 */
const enterpriseOnly = computed(() => route.query.filter === 'enterprise')
const visibleIdentities = computed(() => {
  const all = data.value ?? []
  return enterpriseOnly.value ? all.filter(isEnterpriseType) : all
})
const emptyText = computed(() => (enterpriseOnly.value ? '暂无关联企业身份' : '暂无关联身份'))

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

/** 可进入详情的卡片：社区个体 → 个人名片；有企业记录的企业身份 → 企业详情（无记录的合作企业组织无入口） */
function canOpen(item: MyIdentitySummary) {
  return item.type === 'community_individual' || !!item.enterpriseId
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
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else>
      <section v-if="transfers.length" class="transfer-block">
        <h2 class="transfer-title">待确认的负责人转移</h2>
        <article v-for="item in transfers" :key="item.id" class="m-card transfer-card">
          <p class="transfer-ent">{{ item.enterpriseName }}</p>
          <p class="transfer-desc">{{ item.fromName }} 邀请你接任企业负责人（{{ formatLocalDateTime(item.at) }} 发起）</p>
          <div class="transfer-actions">
            <Button size="small" theme="primary" @click="onRespond(item, 'accept')">接受</Button>
            <Button size="small" variant="outline" @click="onRespond(item, 'reject')">拒绝</Button>
          </div>
        </article>
      </section>

      <EmptyBlock v-if="!visibleIdentities.length" :text="emptyText" />
      <div v-else class="stagger list">
        <!-- v-pressable 只在可进入详情的卡片上注入键盘语义，不可点卡片不进入 Tab 序列 -->
        <article
          v-for="item in visibleIdentities"
          :key="item.key"
          class="m-card id-card" v-pressable="canOpen(item)"
          :class="{ linkable: canOpen(item) }"
          @click="onTap(item)"
        >
          <div class="id-head">
            <IdentityTag :type="item.type" />
            <Tag v-if="item.roleLabel" size="small" variant="light" :theme="item.isContact ? 'primary' : 'default'">
              {{ item.roleLabel }}
            </Tag>
            <Tag v-else-if="item.type === 'community_individual'" size="small" variant="light" theme="primary">个人名片</Tag>
          </div>
          <p class="id-name">{{ item.name }}</p>
          <p v-if="item.subtitle" class="id-sub">{{ item.subtitle }}</p>
          <p class="id-foot">
            <span v-if="item.type === 'community_individual'" class="entry">查看 / 编辑个人名片</span>
            <span v-else class="entry">查看企业名片</span>
            <Icon aria-hidden="true" v-if="canOpen(item)" name="chevron-right" size="14px" class="arrow" />
          </p>
        </article>
      </div>

      <!-- v49：底部补「企业合作」入口，避免已关联企业身份的用户找不到申请第二家企业的路径 -->
      <div class="coop-block">
        <Button theme="primary" variant="outline" block @click="router.push('/intros/enterprise')">
          企业合作
          <template #suffix><Icon aria-hidden="true" name="chevron-right" size="14px" /></template>
        </Button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.m-identities {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.transfer-block {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-4);
}

.transfer-title {
  margin:0;
  font-size: var(--app-font-body);
}

.transfer-ent {
  margin:0;
  font-size: var(--app-font-body);
  font-weight: 600;
}

.transfer-desc {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.transfer-actions {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-5);
}

.id-card.linkable {
  cursor: pointer;
}

.id-head {
  display: flex;
  align-items: center;
  gap:var(--app-space-4);
}

.id-name {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-subtitle);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.id-sub {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.id-foot {
  margin:var(--app-space-4) 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-4);
  font-size: var(--app-font-caption);
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
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
  font-size: var(--app-font-subtitle);
}

.coop-block {
  margin-top: var(--app-space-2);
}
</style>
