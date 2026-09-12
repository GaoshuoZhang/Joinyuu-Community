<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading } from 'tdesign-mobile-vue'
import { fetchPolicies } from '@/api/community'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityPolicy } from '@/types'

/* 入驻说明页（/intros/:kind）：企业入驻 / 人才登记 的政策说明 + 引导登录后申请。
 * 政策内容来自社区运营数据（communityPolicies）；登录后到申请页并预设类型。 */
const route = useRoute()
const router = useRouter()

const kind = computed(() => (route.params.kind === 'talent' ? 'talent' : 'enterprise'))
const meta = computed(() =>
  kind.value === 'talent'
    ? { title: '人才登记', subtitle: '登记个人专长，进入社区人才库', type: 'individual' }
    : { title: '企业入驻', subtitle: '入驻聚屿社区，共享空间与资源', type: 'settle' },
)

const policy = ref<CommunityPolicy | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const list = await fetchPolicies({ category: '入驻指南' })
    const key = kind.value === 'talent' ? '人才登记' : '企业入驻'
    policy.value = list.find((p) => p.title.includes(key)) ?? null
  } finally {
    loading.value = false
  }
})

function goApply() {
  void router.push(`/applications/new?type=${meta.value.type}`)
}
</script>

<template>
  <div class="intro page-fade-in">
    <div class="hero">
      <h1 class="title">{{ meta.title }}</h1>
      <p class="subtitle">{{ meta.subtitle }}</p>
    </div>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="!policy" text="暂无相关政策说明" />
    <article v-else class="m-card policy">
      <h2 class="p-title">{{ policy.title }}</h2>
      <p class="p-summary">{{ policy.summary }}</p>
      <p class="p-content">{{ policy.content }}</p>
      <p class="p-meta">更新于 {{ policy.updatedAt }}</p>
    </article>

    <Button theme="primary" block size="large" class="apply-btn" @click="goApply">去申请{{ meta.title }}</Button>
    <p class="tip">登录后提交申请，社区运营将在 3 个工作日内审核</p>
  </div>
</template>

<style scoped>
.intro {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero {
  padding: 8px 0 4px;
}

.title {
  margin: 0 0 4px;
  font-size: 22px;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.state {
  padding: 32px 0;
}

.p-title {
  margin: 0 0 8px;
  font-size: 15px;
}

.p-summary {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
  padding: 8px 10px;
  border-radius: var(--td-radius-default);
}

.p-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-primary);
}

.p-meta {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.apply-btn {
  margin-top: 8px;
}

.tip {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>