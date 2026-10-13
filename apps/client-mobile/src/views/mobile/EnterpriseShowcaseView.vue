<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Icon, Image, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchEnterpriseShowcase } from '@/api/enterprises'
import { listFavorites, toggleFavorite } from '@/api/favorites'
import { useAuthStore } from '@/stores/auth'
import { shareContent } from '@/utils/share'
import { onImageError } from '@/utils/imageFallback'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { EnterpriseShowcase } from '@/types'

/* 移动企业名片：品牌横幅（渐变 + 企业名首字）+ 介绍 + 企业信息；
 * 仅 published 可见（404 → 空态 + 返回）；名片申请入口在社区·企业库卡片（成员可见）。
 * 2026-09-17 起不再公示企业成员。 */
const route = useRoute()
const router = useRouter()
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
  /* 公开路由：游客不请求收藏列表，避免 401 被统一拦截跳登录 */
  if (!auth.isLogged) return
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
  const next = !favorited.value
  favorited.value = next
  try {
    favorited.value = await toggleFavorite('enterprise', String(route.params.id), showcase.value?.name ?? '', showcase.value?.industry)
    Toast(favorited.value ? '已收藏' : '已取消收藏')
  } catch (e) {
    favorited.value = !next
    Toast(e instanceof Error ? e.message : '操作失败，请稍后重试')
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
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="showcase">
      <section class="banner">
        <span class="badge">
          <Image v-if="showcase.logo" class="badge-img" :src="showcase.logo" alt="" fit="cover" lazy @error="onImageError" />
          <template v-else>{{ firstChar }}</template>
        </span>
        <div class="banner-info">
          <h2 class="name">{{ showcase.name }}</h2>
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

      <div class="foot-actions">
        <Button size="small" variant="outline" @click="onToggleFavorite">
          <template #icon><span class="icon-swap"><Icon aria-hidden="true" name="star-filled" size="16px" :class="{ 'is-on': favorited }" /><Icon aria-hidden="true" name="star" size="16px" :class="{ 'is-on': !favorited }" /></span></template>
          {{ favorited ? '已收藏' : '收藏' }}
        </Button>
        <Button size="small" variant="outline" @click="onShare">
          <template #icon><Icon aria-hidden="true" name="share" size="16px" /></template>
          分享
        </Button>
      </div>
    </template>
    <!-- v46：名片未发布/已下架时（数据为空且无错误）补兜底出口，避免二级页整页空白成为死胡同 -->
    <EmptyBlock
      v-else
      text="名片不存在或已下架"
      action-text="浏览企业库"
      @action="router.push('/community?tab=enterprise')"
    />
  </div>
</template>

<style scoped>
.m-showcase {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.foot-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap:var(--app-space-6);
}


.banner {
  display: flex;
  align-items: center;
  gap:var(--app-space-6);
  padding:var(--app-space-9);
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
}

.badge {
  /* 徽标尺寸与页面其它企业头像位（Avatar 52/56px）同口径，集中为局部变量避免裸 px 散落 */
  --badge-size: 52px;
  flex-shrink: 0;
  width: var(--badge-size);
  height: var(--badge-size);
  display: grid;
  place-items: center;
  border-radius: var(--td-radius-large);
  /* 首字底色：低版本 Safari 不支持 color-mix，先给半透明白兜底再叠加 color-mix，避免首字对比度丢失 */
  background: rgba(255, 255, 255, 0.2);
  background: color-mix(in srgb, var(--td-text-color-anti) 20%, transparent);
  font: var(--app-type-display);
  overflow: hidden;
}

.badge-img {
  width: 100%;
  height: 100%;
}

.banner-info {
  min-width: 0;
}

.name {
  margin:0 0 var(--app-space-2);
  font: var(--app-type-page-title);
}

.tags {
  margin:0;
  font: var(--app-type-caption);
  opacity: 0.85;
}

.sec-title {
  margin:0 0 var(--app-space-4);
  /* v46：与同名章节标题组件（企业详情 / 人才名片）统一为 section 角色档 */
  font: var(--app-type-section);
}

.desc {
  margin:0;
  font: var(--app-type-body-relaxed);
  color: var(--td-text-color-primary);
  white-space: pre-wrap;
}

.info-row {
  display: flex;
  gap:var(--app-space-5);
  margin:0 0 var(--app-space-4);
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.info-row:last-child {
  margin-bottom:0;
}

.info-label {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
}

.info-link {
  color: var(--td-brand-color);
  word-break: break-all;
}

</style>
