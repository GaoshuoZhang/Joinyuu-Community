<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import DOMPurify from 'dompurify'
import { fetchAgreementPolicy } from '@/api/community'
import type { AgreementPolicy } from '@/types'
import ListSkeleton from '@/components/ListSkeleton.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { formatLocalDateTime } from '@/utils/format'

/* 用户协议与隐私政策：读取后台已发布的最新版本，富文本经 DOMPurify 清洗。 */
const loading = ref(true)
const agreements = ref<AgreementPolicy[]>([])
const failed = ref(false)
const POLICY_CACHE_PREFIX = 'joinyuu_policy_'

function readCachedPolicy(kind: AgreementPolicy['kind']): AgreementPolicy | null {
  try {
    const raw = localStorage.getItem(`${POLICY_CACHE_PREFIX}${kind}`)
    return raw ? JSON.parse(raw) as AgreementPolicy : null
  } catch {
    return null
  }
}

function cachePolicy(policy: AgreementPolicy): void {
  try {
    localStorage.setItem(`${POLICY_CACHE_PREFIX}${policy.kind}`, JSON.stringify(policy))
  } catch {
    /* 存储不可用时仍可展示本次请求结果。 */
  }
}

async function load() {
  loading.value = true
  failed.value = false
  try {
    const results = await Promise.allSettled([
      fetchAgreementPolicy('user_agreement'),
      fetchAgreementPolicy('privacy_policy'),
    ])
    const kinds: AgreementPolicy['kind'][] = ['user_agreement', 'privacy_policy']
    agreements.value = results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        cachePolicy(result.value)
        return [result.value]
      }
      const cached = readCachedPolicy(kinds[index])
      return cached ? [cached] : []
    })
    failed.value = results.some((result) => result.status === 'rejected')
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

const sections = computed(() =>
  agreements.value.map((item) => ({ ...item, html: DOMPurify.sanitize(item.content) })),
)

</script>

<template>
  <div class="page-fade-in m-privacy">
    <ListSkeleton v-if="loading" />

    <EmptyBlock v-else-if="failed && !sections.length" text="政策暂时无法加载，请稍后重试" action-text="重试" @action="load" />

    <template v-else-if="sections.length">
      <EmptyBlock v-if="failed" text="部分政策暂时无法更新，当前显示最近成功加载的正式版本" action-text="重试" @action="load" />
      <section v-for="item in sections" :key="item.kind" class="m-card">
        <div class="doc-head">
          <h2>{{ item.title }}</h2>
          <span class="doc-meta">{{ item.version }} · 更新于 {{ formatLocalDateTime(item.publishedAt) }}</span>
        </div>
        <div class="rich-content" v-html="item.html"></div>
      </section>
    </template>

  </div>
</template>

<style scoped>
.m-privacy {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.updated,
.demo-tip {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}


.doc-head {
  margin-bottom:var(--app-space-4);
}

.doc-head h2 {
  margin:0;
  font-size: var(--app-font-subtitle);
}

.doc-meta {
  display: inline-block;
  margin-top:var(--app-space-2);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.m-card h2 {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-body);
}

.m-card p {
  margin:0;
  font-size: var(--app-font-body);
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.rich-content :deep(h2) {
  margin:var(--app-space-8) 0 var(--app-space-4);
  font-size: var(--app-font-body);
  color: var(--td-text-color-primary);
}

.rich-content :deep(h2:first-child) {
  margin-top:0;
}

.rich-content :deep(p) {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-body);
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.rich-content :deep(p:last-child) {
  margin-bottom:0;
}

.rich-content :deep(img) {
  max-width: 100%;
}
</style>
