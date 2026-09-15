<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchMyApplications } from '@/api/applications'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { ApplicationType } from '@/types'

const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyApplications)
onMounted(run)

const typeLabel: Record<ApplicationType, string> = {
  settle: '企业入驻',
  individual: '人才登记',
  cooperation: '合作伙伴',
  identity: '身份绑定',
}
</script>

<template>
  <div class="page-fade-in my-applications">
    <Button theme="primary" block class="new-btn" @click="router.push('/applications/new')">提交新申请</Button>
    <p class="hint">企业入驻 / 合作伙伴 / 人才登记请从首页「企业合作 · 人才登记」入口提交</p>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="!data?.length" text="暂无申请记录" />
    <div v-else class="stagger list">
      <article v-for="a in data" :key="a.id" class="m-card">
        <div class="row">
          <span class="type">{{ typeLabel[a.type] }}</span>
          <StateTag kind="application" :value="a.status" />
        </div>
        <p class="target">{{ a.targetName }}</p>
        <p v-if="a.summary" class="summary">{{ a.summary }}</p>
        <p v-if="a.attachments?.length" class="files">附件（{{ a.attachments.length }}）：{{ a.attachments.map((f) => f.name).join('、') }}</p>
        <p class="meta">提交于 {{ a.submittedAt }}<template v-if="a.reviewedAt"> · 审核于 {{ a.reviewedAt }}</template></p>
        <p v-if="a.rejectReason" class="reject">驳回原因：{{ a.rejectReason }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.my-applications {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.hint {
  margin: 0 2px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-placeholder);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.type {
  font-size: 13px;
  font-weight: 600;
}

.target {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.summary {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-primary);
}

.files {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.reject {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}
</style>
