<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Loading, Button, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchEnterpriseShowcase } from '@/api/enterprises'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { useAuthStore } from '@/stores/auth'
import { submitReport } from '@/api/reports'
import { shareContent } from '@/utils/share'
import { onImageError } from '@/utils/imageFallback'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ReasonSheet from '@/components/ReasonSheet.vue'
import type { EnterpriseShowcase } from '@/types'

/* 移动企业名片：品牌横幅（渐变 + 企业名首字）+ 介绍 + 成员列表；
 * 仅 published 可见（404 → 空态 + 返回）；名片申请入口在社区·企业库卡片（成员可见）；v35 支持举报。 */
const route = useRoute()
const auth = useAuthStore()

const { data, loading, error, run } = useAsyncList<EnterpriseShowcase>(() =>
  fetchEnterpriseShowcase(String(route.params.id)),
)
const showcase = computed(() => data.value)
const firstChar = computed(() => showcase.value?.name.charAt(0) ?? '企')
/* v39：仅允许 http(s) 链接渲染为 href（历史数据兜底） */
const websiteHref = computed(() => {
  const url = showcase.value?.website?.trim() ?? ''
  return /^https?:\/\//i.test(url) ? url : ''
})

/* v40：收藏企业名片 */
const favorited = ref(false)
async function loadFavorite() {
  try {
    const list = await listFavorites()
    favorited.value = list.some((item) => item.type === 'enterprise' && item.targetId === String(route.params.id))
  } catch {
    favorited.value = false
  }
}
async function onToggleFavorite() {
  if (!auth.isLogged) {
    Toast('登录后可收藏')
    return
  }
  try {
    favorited.value = await toggleFavorite('enterprise', String(route.params.id), showcase.value?.name ?? '', showcase.value?.industry)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
  }
}

const reportVisible = ref(false)
const REPORT_REASONS = ['信息不实', '冒用他人企业', '违规经营', '侵权内容', '其他']

async function onReport(text: string) {
  if (!text) return void Toast('请选择举报原因')
  try {
    await submitReport({ targetType: 'enterprise', targetId: String(route.params.id), targetTitle: showcase.value?.name ?? '', reason: text })
    Toast('举报已提交，运营将核实处理')
  } catch (e) {
    Toast(e instanceof Error ? e.message : '举报提交失败，请稍后重试')
  }
}

/* v40：分享企业名片 */
async function onShare() {
  const item = showcase.value
  if (!item) return
  await shareContent({ title: item.name, text: item.description })
}

onMounted(async () => {
  await run()
  await loadFavorite()
})
</script>

<template>
  <div class="page-fade-in m-showcase">
    <Loading v-if="loading" class="state" text="加载中…" />
    <template v-else-if="error">
      <EmptyBlock :text="error" action-text="重试" @action="run" />
    </template>
    <template v-else-if="showcase">
      <section class="banner">
        <span class="badge">
          <img v-if="showcase.logo" class="badge-img" :src="showcase.logo" alt="" loading="lazy" decoding="async" @error="onImageError" />
          <template v-else>{{ firstChar }}</template>
        </span>
        <div class="banner-info">
          <h1 class="name">{{ showcase.name }}</h1>
          <p class="tags">
            {{ [showcase.industry, showcase.size, showcase.foundedAt ? `成立于 ${showcase.foundedAt}` : ''].filter(Boolean).join(' · ') }}
          </p>
        </div>
      </section>

      <section class="m-card">
        <h3 class="sec-title">企业介绍</h3>
        <p class="desc">{{ showcase.description }}</p>
      </section>

      <section v-if="showcase.services" class="m-card">
        <h3 class="sec-title">主营业务 / 服务</h3>
        <p class="desc">{{ showcase.services }}</p>
      </section>

      <section v-if="showcase.advantages" class="m-card">
        <h3 class="sec-title">核心优势</h3>
        <p class="desc">{{ showcase.advantages }}</p>
      </section>

      <section v-if="showcase.address || showcase.website" class="m-card">
        <h3 class="sec-title">企业信息</h3>
        <p v-if="showcase.address" class="info-row">
          <span class="info-label">办公地点</span>
          <span>{{ showcase.address }}</span>
        </p>
        <p v-if="showcase.website" class="info-row">
          <span class="info-label">企业官网</span>
          <a v-if="websiteHref" class="info-link" :href="websiteHref" target="_blank" rel="noopener">{{ showcase.website }}</a>
          <span v-else>{{ showcase.website }}</span>
        </p>
      </section>

      <section class="m-card">
        <h3 class="sec-title">成员（{{ showcase.members.length }}）</h3>
        <div v-if="showcase.members.length" class="members">
          <span v-for="m in showcase.members" :key="m" class="member">{{ m }}</span>
        </div>
        <p v-else class="members-empty">暂未公示成员</p>
      </section>
      <div class="foot-actions">
        <Button size="small" variant="outline" @click="onToggleFavorite">{{ favorited ? '★ 已收藏' : '☆ 收藏' }}</Button>
        <Button size="small" variant="outline" @click="onShare">分享</Button>
        <p class="report-link" v-pressable @click="reportVisible = true">举报该企业名片</p>
      </div>
      <ReasonSheet v-model:visible="reportVisible" title="举报企业名片" :reasons="REPORT_REASONS" placeholder="补充说明（选填）…" submit-label="提交举报" @submit="onReport" />
    </template>
  </div>
</template>

<style scoped>
.m-showcase {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.report-link {
  margin: 0;
  padding: 4px 2px 8px;
  text-align: right;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  cursor: pointer;
}

.foot-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}

.foot-actions .report-link {
  padding-bottom: 4px;
}

.state {
  padding: 20px 0;
}

.banner {
  display: flex;
  align-items: center;
  gap: 12px;
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
  border-radius: var(--td-radius-large);
  background: rgba(255, 255, 255, 0.2);
  font-size: 26px;
  font-weight: 700;
  overflow: hidden;
}

.badge-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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

.info-row {
  display: flex;
  gap: 10px;
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
}

.info-link {
  color: var(--td-brand-color);
  word-break: break-all;
}

.members {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.member {
  font-size: 12px;
  padding: 3px 11px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.members-empty {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
