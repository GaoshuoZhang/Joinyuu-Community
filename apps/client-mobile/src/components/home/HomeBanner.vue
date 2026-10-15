<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, Icon, Swiper, SwiperItem } from 'tdesign-mobile-vue'
import type { HomeBanner } from '@/types'

/* 首页轮播：图片优先，无图时使用品牌渐变文字卡；高度由唯一常量固定（KeepAlive 返回时不受测量影响）。
 * 尊重 prefers-reduced-motion。
 * v52：自动播放提供可见的暂停/播放控件（WCAG 2.2.2，界面审查 MEDIUM-3）。
 * 注意：TDesign Swiper 不监听 autoplay 属性的变化（swiper.mjs 仅在挂载、手势与 current 变化时起停定时器），
 * 因此切换播放态时以 key 重挂载，并用 current 保留当前帧，避免跳回第一条。 */
const props = withDefaults(defineProps<{ banners: HomeBanner[]; reduceMotion?: boolean }>(), {
  reduceMotion: false,
})

defineEmits<{ select: [index: number] }>()

const BANNER_HEIGHT = 130
const failedImages = ref(new Set<string>())
const firstImageIndex = computed(() => props.banners.findIndex((banner) => !!banner.imageUrl))

/* 当前帧与播放态：current 由 change 事件回写，重挂载时作为初始帧传入 */
const currentIndex = ref(0)
const swiperKey = ref(0)
const playing = ref(!props.reduceMotion)
const autoplayOn = computed(() => playing.value && !props.reduceMotion)
/* reduced-motion 下本就不自动播放（无运动需要暂停）；单条横幅也无播放意义 */
const showPlayToggle = computed(() => !props.reduceMotion && props.banners.length > 1)

function onChange(current: number) {
  currentIndex.value = current
}

function togglePlay() {
  playing.value = !playing.value
  swiperKey.value += 1
}

function imageKey(banner: HomeBanner) {
  return `${banner.id}:${banner.imageUrl ?? ''}`
}

function markImageFailed(banner: HomeBanner) {
  failedImages.value.add(imageKey(banner))
}
</script>

<template>
  <div v-if="banners.length" class="banner-wrap">
    <Swiper
      :key="swiperKey"
      class="banner"
      :height="BANNER_HEIGHT"
      :style="{ '--home-banner-height': `${BANNER_HEIGHT}px` }"
      :loop="true"
      :autoplay="autoplayOn"
      :interval="4500"
      :current="currentIndex"
      @change="onChange"
    >
    <SwiperItem v-for="(b, index) in banners" :key="b.id">
      <Button variant="text"
        type="button"
        class="banner-card"
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
      </Button>
    </SwiperItem>
    </Swiper>
    <!-- v52：自动轮播的可见暂停/播放控件（WCAG 2.2.2）；44px 命中区，图标 16px，按压反馈走 .pressable -->
    <Button variant="text"
      v-if="showPlayToggle"
      type="button"
      class="banner-play-toggle pressable"
      :aria-label="playing ? '暂停轮播播放' : '开始轮播播放'"
      @click="togglePlay"
    >
      <Icon aria-hidden="true" :name="playing ? 'pause' : 'play'" size="16px" />
    </Button>
  </div>
</template>

<style scoped>
.banner-card :deep(.t-button__content) { display: block; width: 100%; height: 100%; white-space: normal; }
/* v52：轮播与暂停控件的外层定位容器（控件叠在轮播右下角，不进入 Swiper 的子节点序列） */
.banner-wrap {
  position: relative;
  border-radius: var(--td-radius-large);
  overflow: hidden;
}

.banner {
  height: var(--home-banner-height);
  border-radius: var(--td-radius-large);
  overflow: hidden;
}

/* v52：暂停/播放控件：右下角、44px 命中区、半透明深底保证白图标在浅色横幅图上可辨 */
.banner-play-toggle {
  position: absolute;
  right: var(--app-space-3);
  bottom: var(--app-space-3);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: var(--td-radius-circle);
  color: var(--td-text-color-anti);
  background: oklch(0 0 0 / 0.45);
  cursor: pointer;
}

.banner-play-toggle:focus-visible {
  outline: 2px solid var(--td-text-color-anti);
  outline-offset: 2px;
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
