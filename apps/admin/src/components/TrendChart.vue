<script setup lang="ts">
import { computed, ref } from 'vue'

/* 轻量折线趋势图：零依赖 SVG 实现，供工作台 30 日趋势使用。
 * 特性：网格 + 渐变面积 + 悬浮十字线与数值提示。如需更复杂图表可替换为 echarts。 */

const props = withDefaults(
  defineProps<{
    labels: string[]
    data: number[]
    color?: string
    height?: number
    unit?: string
  }>(),
  {
    // SVG presentation attribute 不支持 var()，token 色值统一经 :style 绑定生效
    color: 'var(--td-brand-color)',
    height: 240,
    unit: '',
  },
)

const W = 760
const PAD = { top: 16, right: 16, bottom: 28, left: 48 }

/* 同页多图共用色值时渐变 id 需唯一，否则后渲染的 defs 会覆盖前者 */
const uid = Math.random().toString(36).slice(2, 9)
const fillId = `trend-fill-${uid}`

const innerW = computed(() => W - PAD.left - PAD.right)
const innerH = computed(() => props.height - PAD.top - PAD.bottom)

const max = computed(() => {
  const m = Math.max(...props.data, 1)
  return m + m * 0.15
})

const min = computed(() => Math.min(...props.data, 0))

const xAt = (i: number) => PAD.left + (props.data.length <= 1 ? innerW.value / 2 : (innerW.value * i) / (props.data.length - 1))
const yAt = (v: number) => PAD.top + innerH.value - ((v - min.value) / (max.value - min.value || 1)) * innerH.value

const points = computed(() => props.data.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' '))

const areaPath = computed(() => {
  if (!props.data.length) return ''
  const first = props.data.map((_, i) => xAt(i))[0]
  const last = props.data.length ? xAt(props.data.length - 1) : PAD.left
  const bottom = PAD.top + innerH.value
  return `M ${first} ${bottom} L ${points.value.replace(/ /g, ' L ')} L ${last} ${bottom} Z`
})

/* y 轴刻度（4 档） */
const ticks = computed(() => {
  const n = 4
  const values: { v: number; y: number }[] = []
  for (let i = 0; i <= n; i++) {
    const v = min.value + ((max.value - min.value) * i) / n
    values.push({ v, y: yAt(v) })
  }
  return values
})

/* x 轴显示标签（等距取 6 个） */
const xLabels = computed(() => {
  const step = Math.max(1, Math.floor(props.labels.length / 6))
  return props.labels.map((l, i) => ({ label: l, x: xAt(i), show: i % step === 0 || i === props.labels.length - 1 }))
})

/* 悬浮交互 */
const hoverIndex = ref<number | null>(null)

function onMove(e: MouseEvent) {
  const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * W
  if (x < PAD.left || x > PAD.left + innerW.value) {
    hoverIndex.value = null
    return
  }
  const idx = Math.round(((x - PAD.left) / innerW.value) * (props.data.length - 1))
  hoverIndex.value = Math.max(0, Math.min(props.data.length - 1, idx))
}

function onKeydown(e: KeyboardEvent) {
  if (!props.data.length) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  e.preventDefault()
  const current = hoverIndex.value ?? (e.key === 'ArrowRight' ? -1 : props.data.length)
  hoverIndex.value = Math.max(0, Math.min(props.data.length - 1, current + (e.key === 'ArrowRight' ? 1 : -1)))
}

const accessibleSummary = computed(() => {
  if (!props.data.length) return '暂无趋势数据'
  return `趋势图，共 ${props.data.length} 个数据点，最小值 ${Math.min(...props.data).toLocaleString('zh-CN')}，最大值 ${Math.max(...props.data).toLocaleString('zh-CN')}`
})

const hoverInfo = computed(() => {
  const i = hoverIndex.value
  if (i === null || props.data[i] === undefined) return null
  const v = props.data[i]
  return {
    x: xAt(i),
    y: yAt(v),
    label: props.labels[i] ?? '',
    value: v,
  }
})
</script>

<template>
  <div class="trend-chart">
    <div class="chart-scroll">
      <svg
        :viewBox="`0 0 ${W} ${height}`"
        :style="{ width: '100%', height: `${height}px`, display: 'block' }"
        role="img"
        tabindex="0"
        :aria-label="accessibleSummary"
        @mousemove="onMove"
        @mouseleave="hoverIndex = null"
        @keydown="onKeydown"
      >
        <defs>
          <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :style="{ stopColor: props.color }" stop-opacity="0.18" />
            <stop offset="100%" :style="{ stopColor: props.color }" stop-opacity="0.02" />
          </linearGradient>
        </defs>

        <!-- 网格 + y 轴刻度 -->
        <g v-for="t in ticks" :key="t.y">
          <line
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="t.y"
            :y2="t.y"
            :style="{ stroke: 'var(--td-component-stroke)' }"
            stroke-width="1"
          />
          <text :x="PAD.left - 8" :y="t.y + 4" text-anchor="end" class="axis-text">
            {{ Math.round(t.v).toLocaleString('zh-CN') }}
          </text>
        </g>

        <!-- x 轴日期标签 -->
        <g v-for="xl in xLabels" :key="xl.x">
          <text v-if="xl.show" :x="xl.x" :y="height - 8" text-anchor="middle" class="axis-text">
            {{ xl.label }}
          </text>
        </g>

        <!-- 面积与折线 -->
        <path :d="areaPath" :fill="`url(#${fillId})`" />
        <polyline
          :points="points"
          fill="none"
          :style="{ stroke: props.color }"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <!-- 悬浮十字线 + 数据点 -->
        <g v-if="hoverInfo">
          <line
            :x1="hoverInfo.x"
            :x2="hoverInfo.x"
            :y1="PAD.top"
            :y2="PAD.top + innerH"
            :style="{ stroke: 'var(--td-brand-color)' }"
            stroke-width="1"
            stroke-dasharray="4 3"
          />
          <circle
            :cx="hoverInfo.x"
            :cy="hoverInfo.y"
            r="4"
            :style="{ fill: props.color, stroke: 'var(--td-bg-color-container)' }"
            stroke-width="2"
          />
          <g :transform="`translate(${hoverInfo.x > W / 2 ? hoverInfo.x - 132 : hoverInfo.x + 10}, ${Math.max(0, hoverInfo.y - 52)})`">
            <rect
              width="122"
              height="40"
              rx="6"
              :style="{ rx: 'var(--td-radius-medium)', fill: 'var(--td-bg-color-container)', stroke: 'var(--td-component-border)' }"
            />
            <text :x="10" :y="16" class="tip-label">{{ hoverInfo.label }}</text>
            <text :x="10" :y="33" class="tip-value" :style="{ fill: props.color }">
              {{ hoverInfo.value.toLocaleString('zh-CN') }}{{ unit }}
            </text>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.chart-scroll {
  overflow-x: auto;
}

/* 窄容器下 SVG 不再等比缩小（否则 12px 轴标签会被压到不可读），改为横向滚动 */
.chart-scroll svg {
  min-width: 560px;
}

.axis-text {
  font-size: 12px;
  fill: var(--td-text-color-secondary);
}

.tip-label {
  font-size: 12px;
  fill: var(--td-text-color-secondary);
}

.tip-value {
  font-size: 14px;
  font-weight: 600;
}
</style>
