<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchEnterpriseShowcase } from '@/api/enterprises'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { EnterpriseShowcase } from '@/types'

/* 移动企业展示页：品牌横幅（渐变 + 企业名首字）+ 介绍 + 成员列表；
 * 仅 published 可见（404 → 空态 + 返回）；申请入口仅通过 /enterprises/:id/showcase-apply 路由直达 */
const route = useRoute()
const router = useRouter()

const { data, loading, error, run } = useAsyncList<EnterpriseShowcase>(() =>
  fetchEnterpriseShowcase(String(route.params.id)),
)
const showcase = computed(() => data.value)
const firstChar = computed(() => showcase.value?.name.charAt(0) ?? '企')

onMounted(run)
</script>

<template>
  <div class="page-fade-in m-showcase">
    <Loading v-if="loading" class="state" text="加载中…" />
    <template v-else-if="error">
      <EmptyBlock :text="error" />
      <Button variant="outline" block @click="router.back()">返回</Button>
    </template>
    <template v-else-if="showcase">
      <section class="banner">
        <span class="badge">{{ firstChar }}</span>
        <div class="banner-info">
          <h1 class="name">{{ showcase.name }}</h1>
          <p class="tags">{{ showcase.industry }} · {{ showcase.size }}</p>
        </div>
      </section>

      <section class="m-card">
        <h3 class="sec-title">企业介绍</h3>
        <p class="desc">{{ showcase.description }}</p>
      </section>

      <section class="m-card">
        <h3 class="sec-title">成员（{{ showcase.members.length }}）</h3>
        <div v-if="showcase.members.length" class="members">
          <span v-for="m in showcase.members" :key="m" class="member">{{ m }}</span>
        </div>
        <p v-else class="members-empty">暂未公示成员</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-showcase {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.state {
  padding: 20px 0;
}

.banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 18px;
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
}

.badge {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 26px;
  font-weight: 700;
}

.banner-info {
  min-width: 0;
}

.name {
  margin: 0 0 4px;
  font-size: 18px;
  line-height: 1.3;
}

.tags {
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
}

.sec-title {
  margin: 0 0 8px;
  font-size: 14px;
}

.desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-primary);
  white-space: pre-wrap;
}

.members {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.member {
  font-size: 11px;
  padding: 3px 11px;
  border-radius: 999px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.members-empty {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
