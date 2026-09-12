<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading, Toast } from 'tdesign-mobile-vue'
import { checkInEvent, fetchEvent } from '@/api/events'
import { useAsyncList } from '@/composables/useAsyncList'
import { getPosition } from '@/utils/geolocation'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityEvent } from '@/types'
import type { GeoPosition } from '@/utils/geolocation'

/* 移动位置签到：活动信息 + 定位→围栏校验→签到；加载时静默预定位一次，错误内联展示并保留重试 */
const route = useRoute()
const router = useRouter()
const eventId = route.params.id as string

const { data: event, loading, error, run } = useAsyncList<CommunityEvent>(() => fetchEvent(eventId))
onMounted(async () => {
  await run()
  silentLocate()
})

const phase = ref<'idle' | 'locating' | 'verifying' | 'success' | 'failed'>('idle')
const position = ref<GeoPosition | null>(null)
const geoHint = ref('')
const pointsAwarded = ref(0)
const failMessage = ref('')

async function silentLocate() {
  try {
    position.value = await getPosition()
    geoHint.value = ''
  } catch {
    geoHint.value = '尚未获取到定位，请点击下方按钮手动签到'
  }
}

async function startCheckIn() {
  phase.value = 'locating'
  failMessage.value = ''
  try {
    position.value = await getPosition()
  } catch (e) {
    phase.value = 'failed'
    failMessage.value = e instanceof Error ? e.message : '定位失败，请稍后重试'
    Toast(failMessage.value)
    return
  }
  geoHint.value = ''
  phase.value = 'verifying'
  try {
    const res = await checkInEvent(eventId, { lat: position.value.lat, lng: position.value.lng })
    pointsAwarded.value = res.pointsAwarded
    phase.value = 'success'
  } catch (e) {
    phase.value = 'failed'
    failMessage.value = e instanceof Error ? e.message : '签到失败，请稍后重试'
  }
}

function backToDetail() {
  router.push(`/events/${eventId}`)
}
</script>

<template>
  <div class="m-checkin page-fade-in stagger">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <template v-else-if="event">
      <section class="m-card info">
        <h1 class="title">{{ event.title }}</h1>
        <p class="meta">⏰ 签到时间窗：{{ event.checkinOpenMin }} - {{ event.checkinCloseMin }}</p>
        <p class="meta">🎯 签到半径：场地 {{ event.checkinRadiusM }} 米范围内</p>
      </section>

      <section class="m-card stage">
        <template v-if="phase === 'success'">
          <div class="success">
            <span class="success-icon">✅</span>
            <p class="success-title">签到成功</p>
            <p class="success-points">积分 +{{ pointsAwarded }}</p>
            <p class="success-tip">已记录本次位置签到，记得准时参加活动哦。</p>
            <Button theme="default" variant="outline" @click="backToDetail">返回活动详情</Button>
          </div>
        </template>

        <template v-else>
          <p v-if="position" class="coord">已获取定位：{{ position.lat.toFixed(5) }}, {{ position.lng.toFixed(5) }}</p>
          <p v-else-if="geoHint" class="geo-hint">{{ geoHint }}</p>
          <p v-if="phase === 'failed' && failMessage" class="fail">{{ failMessage }}</p>

          <Button
            theme="primary"
            block
            :disabled="phase === 'locating' || phase === 'verifying'"
            @click="startCheckIn"
          >
            {{ phase === 'locating' ? '正在获取定位…' : phase === 'verifying' ? '正在校验距离…' : '获取定位并签到' }}
          </Button>
          <p class="tip">签到需在活动签到时间窗内、距场地 {{ event.checkinRadiusM }} 米以内完成。</p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-checkin {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.4;
}

.meta {
  margin: 5px 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 18px;
  text-align: center;
}

.coord {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.geo-hint {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.fail {
  margin: 0;
  font-size: 12px;
  color: var(--td-error-color);
  line-height: 1.6;
}

.tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.success-icon {
  font-size: 44px;
}

.success-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--td-success-color);
}

.success-points {
  margin: 0;
  font-size: 14px;
  color: var(--td-brand-color);
  font-weight: 600;
}

.success-tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
