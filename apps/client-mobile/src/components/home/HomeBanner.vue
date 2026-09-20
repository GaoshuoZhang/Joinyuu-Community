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
  font: inherit;
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
  font-size: var(--app-font-caption);
  opacity: 0.72;
}

.banner-text {
  position: relative;
  z-index: 1;
}

.banner-title {
  position: relative;
  margin: 0 0 var(--app-space-3);
  font-size: var(--app-font-title);
  font-weight: 600;
}

.banner-sub {
  position: relative;
  margin:0;
  font-size: var(--app-font-caption);
  opacity: 0.85;
}
</style>
