<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon, Swiper, SwiperItem } from 'tdesign-mobile-vue'
import type { HomeBanner } from '@/types'

/* 首页轮播：图片优先，无图时使用品牌渐变文字卡；高度由唯一常量固定（KeepAlive 返回时不受测量影响）。
 * 尊重 prefers-reduced-motion。 */
const props = withDefaults(defineProps<{ banners: HomeBanner[]; reduceMotion?: boolean }>(), {
  reduceMotion: false,
})

defineEmits<{ select: [index: number] }>()

const BANNER_HEIGHT = 130
const failedImages = ref(new Set<string>())
const firstImageIndex = computed(() => props.banners.findIndex((banner) => !!banner.imageUrl))

function imageKey(banner: HomeBanner) {
  return `${banner.id}:${banner.imageUrl ?? ''}`
}

function markImageFailed(banner: HomeBanner) {
  failedImages.value.add(imageKey(banner))
}
</script>

<template>
  <Swiper
    v-if="banners.length"
    class="banner"
    :height="BANNER_HEIGHT"
    :style="{ '--home-banner-height': `${BANNER_HEIGHT}px` }"
    :loop="true"
    :autoplay="!reduceMotion"
    :interval="4500"
  >
    <SwiperItem v-for="(b, index) in banners" :key="b.id">
      <button
        type="button"
        class="banner-card"
        v-pressable
        :aria-label="b.subtitle ? `${b.title}，${b.subtitle}` : b.title"
        @click="$emit('select', index)"
      >
        <img
          v-if="b.imageUrl && !failedImages.has(imageKey(b))"
          class="banner-img"
          :src="b.imageUrl"
          alt=""
          :loading="index === firstImageIndex ? 'eager' : 'lazy'"
          :fetchpriority="index === firstImageIndex ? 'high' : 'auto'"
          @error="markImageFailed(b)"
        />
        <div v-else-if="b.imageUrl" class="banner-image-failed" aria-hidden="true">
          <Icon name="image-error" size="24px" />
          <span>图片暂不可用</span>
        </div>
        <!-- v46：图片上直接压白字在浅色图下不可读，图片与文字之间加一层渐变遮罩（与明暗模式一致）。
             仅图片正常显示时加；无图/图片失败的兜底是品牌渐变色块，不叠加多余遮罩。 -->
        <div
          v-if="b.imageUrl && !failedImages.has(imageKey(b))"
          class="banner-scrim"
          aria-hidden="true"
        />
        <div class="banner-text">
          <p class="banner-title">{{ b.title }}</p>
          <p class="banner-sub">{{ b.subtitle }}</p>
        </div>
      </button>
    </SwiperItem>
  </Swiper>
</template>

<style scoped>
.banner {
  height: var(--home-banner-height);
  border-radius: var(--td-radius-large);
  overflow: hidden;
}

.banner :deep(.t-swiper__container) {
  height: var(--home-banner-height);
}

.banner-card {
  position: relative;
  display: block;
  width: 100%;
  height: var(--home-banner-height);
  padding: var(--app-space-9) var(--app-space-10);
  border: 0;
  color: var(--td-text-color-anti);
  overflow: hidden;
  background: var(--client-brand-gradient);
  text-align: left;
  cursor: pointer;
}

.banner-card:focus-visible {
  outline: 2px solid var(--td-text-color-anti);
  outline-offset: -4px;
}

.banner-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.banner-image-failed {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--app-space-3);
  color: var(--td-text-color-anti);
  background: var(--client-brand-gradient);
  font: var(--app-type-caption);
  opacity: 0.72;
}

/* v46：文字区位于卡片上部，遮罩自上而下渐弱（渐变定义见 tokens.css --app-image-scrim）；
 * 顶部 0.65 黑叠加即使底图接近纯白，白字（含 0.85 不透明度副标题）对比度仍可满足 WCAG AA 正文要求。 */
.banner-scrim {
  position: absolute;
  inset: 0;
  background: var(--app-image-scrim);
}

.banner-text {
  position: relative;
  z-index: 1;
}

.banner-title {
  position: relative;
  margin: 0 0 var(--app-space-3);
  font: var(--app-type-page-title);
}

.banner-sub {
  position: relative;
  margin:0;
  font: var(--app-type-body-sm);
  opacity: 0.85;
}
</style>
