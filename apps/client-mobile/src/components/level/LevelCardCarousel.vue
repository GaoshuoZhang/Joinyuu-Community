<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { Icon, Progress } from 'tdesign-mobile-vue'
import type { RealnameRightsGroup } from '@/types'
import { formatZhNumber } from '@/utils/format'

/* 等级权益卡片轮播（社区个体 / 社区企业共用）：
 * 横向 scroll-snap 卡片流，进入时自动定位到当前等级卡；左邻=上一级、右邻=下一级。
 * 当前卡为品牌渐变实底 + 「当前」角标 + 进度条；其余卡浅底，按经验门槛标「已获得 / 未解锁」。
 * 支持键盘左右方向键切换（容器可聚焦），尊重 prefers-reduced-motion。 */
const props = withDefaults(
  defineProps<{
    /** 按 level 升序的权益分组（同 identityType） */
    groups: RealnameRightsGroup[]
    /** 当前等级（null = 未定级，定位到第一张卡） */
    currentLevel: number | null
    /** 当前经验值（判定各卡「已获得」） */
    currentExperience: number
    /** 当前卡进度条百分比（null = 不显示进度，如企业页仅展示权益） */
    progressPercent?: number | null
    /** 身份标签（社区个体 / 社区企业） */
    identityLabel: string
  }>(),
  { progressPercent: null },
)

const track = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

const cards = computed(() =>
  props.groups.map((g) => {
    const isCurrent = g.level === props.currentLevel
    return {
      ...g,
      isCurrent,
      /** 经验达到该级门槛即「已获得」（当前级天然已获得） */
      reached: isCurrent || (g.threshold !== null && g.threshold !== undefined && props.currentExperience >= g.threshold),
    }
  }),
)

function scrollToCard(index: number, smooth = true) {
  const el = track.value
  const card = el?.children[index] as HTMLElement | undefined
  if (!el || !card) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.clientWidth) / 2, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' })
  activeIndex.value = index
}

function onScroll() {
  /* 吸附完成后同步 activeIndex（取最接近容器中心的卡片） */
  const el = track.value
  if (!el) return
  const center = el.scrollLeft + el.clientWidth / 2
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  Array.from(el.children).forEach((child, i) => {
    const node = child as HTMLElement
    const cardCenter = node.offsetLeft + node.clientWidth / 2
    const dist = Math.abs(cardCenter - center)
    if (dist < bestDist) {
      bestDist = dist
      best = i
    }
  })
  activeIndex.value = best
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const next = event.key === 'ArrowRight' ? activeIndex.value + 1 : activeIndex.value - 1
  if (next < 0 || next >= cards.value.length) return
  scrollToCard(next)
}

onMounted(async () => {
  await nextTick()
  const initial = cards.value.findIndex((c) => c.isCurrent)
  scrollToCard(initial >= 0 ? initial : 0, false)
})

defineExpose({ scrollToCard })
</script>

<template>
  <div
    ref="track"
    class="level-track"
    tabindex="0"
    role="group"
    :aria-label="`${identityLabel}等级权益，共 ${cards.length} 个等级，可左右滑动查看`"
    @scroll.passive="onScroll"
    @keydown="onKeydown"
  >
    <article
      v-for="card in cards"
      :key="`${card.identityType}-${card.level}`"
      class="level-card"
      :class="{ current: card.isCurrent, locked: !card.reached && !card.isCurrent }"
      :aria-current="card.isCurrent ? 'step' : undefined"
    >
      <header class="card-head">
        <span class="identity">{{ identityLabel }}</span>
        <span v-if="card.isCurrent" class="current-badge">当前</span>
        <span v-else-if="card.reached" class="reached-badge">已获得</span>
        <span v-else class="locked-badge"><Icon aria-hidden="true" name="lock-on" size="12px" />未解锁</span>
      </header>
      <p class="lv"><span class="lv-num tabular-nums">Lv.{{ card.level }}</span><span v-if="card.label" class="lv-name">{{ card.label }}</span></p>
      <template v-if="card.isCurrent && progressPercent !== null">
        <Progress
          theme="line"
          :percentage="progressPercent"
          :label="false"
          color="var(--td-text-color-anti)"
          track-color="color-mix(in srgb, var(--td-text-color-anti) 25%, transparent)"
        />
        <p class="meta">当前 {{ formatZhNumber(currentExperience) }} 经验</p>
      </template>
      <p v-else-if="card.threshold !== null && card.threshold !== undefined" class="meta">
        {{ card.isCurrent ? `当前 ${formatZhNumber(currentExperience)} 经验` : `需 ${formatZhNumber(card.threshold)} 经验达成` }}
      </p>
      <ul class="rights">
        <li v-for="item in card.items" :key="item" class="right-item">{{ item }}</li>
      </ul>
    </article>
  </div>
</template>

<style scoped>
.level-track {
  display: flex;
  gap: var(--app-space-5);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding: var(--app-space-1) calc((100% - var(--app-card-width, 82%)) / 2);
  outline-offset: 2px;
}

.level-track::-webkit-scrollbar { display: none; }

.level-card {
  --app-card-width: 82%;

  flex: 0 0 var(--app-card-width);
  scroll-snap-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
  padding: var(--app-space-7);
  border-radius: var(--td-radius-large);
  border: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
}

/* 当前等级卡：品牌渐变实底（与原 level-card 视觉一致） */
.level-card.current {
  border-color: transparent;
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
}

/* 未解锁卡：整体弱化 */
.level-card.locked {
  opacity: 0.72;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.identity {
  font: var(--app-type-caption);
  opacity: 0.85;
}

.current-badge {
  font: var(--app-type-caption); /* typography-token-exempt: 紧随其后的 line-height 是徽章胶囊高度约束（零余量行高贴合 3px 内距），角色档行高（1.5）会把徽章撑高约 4px；升级复核角色档是否引入紧凑行高档 */
  line-height: 1;
  padding: 3px var(--app-space-2);
  border-radius: var(--td-radius-small);
  background: var(--td-text-color-anti);
  /* 徽章底固定为反色（两种模式下都是白色），而 --td-brand-color 在暗色是「暗底专用」的
   * 亮蓝（#4582e6，白底上仅 3.76:1）；改用 -7 档（浅 #0052d9 / 暗 #2667d4），白底上 ≥5.1:1。 */
  color: var(--td-brand-color-7);
}

.reached-badge {
  font: var(--app-type-caption); /* typography-token-exempt: 同上，徽章胶囊高度约束，角色档行高会撑高徽章；升级复核角色档是否引入紧凑行高档 */
  line-height: 1;
  padding: 3px var(--app-space-2);
  border-radius: var(--td-radius-small);
  background: var(--td-success-color-light);
  /* -5 档压 -1 档浅底仅 2.86:1（暗色 3.23:1）；-7 档浅色 5.88:1、暗色 5.45:1 */
  color: var(--td-success-color-7);
}

.locked-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font: var(--app-type-caption); /* typography-token-exempt: 同上，徽章胶囊高度约束，角色档行高会撑高徽章；升级复核角色档是否引入紧凑行高档 */
  line-height: 1;
  padding: 3px var(--app-space-2);
  border-radius: var(--td-radius-small);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
}

.lv {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-3);
  margin: 0;
}

.lv-num {
  font: var(--app-type-numeric-lg);
  font-variant-numeric: tabular-nums;
}

.lv-name {
  font: var(--app-type-card-title);
}

.meta {
  margin: 0;
  font: var(--app-type-caption);
  opacity: 0.85;
}

.rights {
  list-style: none;
  margin: var(--app-space-2) 0 0;
  padding: var(--app-space-4) 0 0;
  border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.right-item {
  font: var(--app-type-body-sm);
  opacity: 0.92;
}
</style>
