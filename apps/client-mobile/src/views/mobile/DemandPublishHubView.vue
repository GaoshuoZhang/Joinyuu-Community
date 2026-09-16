<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { useConfigStore } from '@/stores/config'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { DEMAND_KINDS } from '@/constants/demand'
import type { DemandKind } from '@/types'

/* 发布需求 Hub：三类需求（找服务 / 找投资 / 找合作）选择后进入独立表单 */
const router = useRouter()
const config = useConfigStore()
const demandOpen = ref(true)
const selected = ref<DemandKind | ''>('')

const FORM_ROUTES: Record<DemandKind, string> = {
  task: '/demands/new/task',
  investment: '/demands/new/invest',
  cooperation: '/demands/new/cooperation',
}

const ctaText = computed(() => {
  const meta = DEMAND_KINDS.find((k) => k.kind === selected.value)
  return meta ? meta.cta : '请先选择需求类型'
})

onMounted(async () => {
  await config.ensureLoaded()
  demandOpen.value = config.config.demandOpen
})

function goForm() {
  if (!selected.value) return
  void router.push(FORM_ROUTES[selected.value])
}
</script>

<template>
  <div class="publish-hub page-fade-in">
    <div v-if="!demandOpen">
      <EmptyBlock text="发布功能暂未开放" />
    </div>

    <template v-else>
      <header class="head">
        <h1 class="title">发布需求</h1>
        <p class="desc">先选择需求类型，再填写对应表单；提交后进入审核，通过后公开展示</p>
      </header>

      <section
        v-for="item in DEMAND_KINDS"
        :key="item.kind"
        class="kind-card m-card"
        :class="{ active: selected === item.kind }"
        v-pressable
        @click="selected = item.kind"
      >
        <div class="card-head">
          <h2 class="kind-title">{{ item.title }}</h2>
          <span class="radio" :class="{ on: selected === item.kind }" />
        </div>
        <p class="tagline">{{ item.tagline }}</p>
        <div class="process">
          <template v-for="(s, i) in item.process" :key="s">
            <span class="step">{{ s }}</span>
            <span v-if="i < item.process.length - 1" class="arrow">›</span>
          </template>
        </div>
        <ul class="bullets">
          <li v-for="b in item.bullets" :key="b">{{ b }}</li>
        </ul>
      </section>

      <Button theme="primary" block size="large" class="cta" :disabled="!selected" @click="goForm">
        {{ ctaText }}
      </Button>
      <Button theme="primary" variant="text" block @click="router.push('/me/demands')">查看我的需求 ›</Button>
    </template>
  </div>
</template>

<style scoped>
.publish-hub {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  padding: 0 2px;
}

.head .title {
  margin: 0 0 4px;
  font-size: 18px;
}

.head .desc {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.kind-card {
  cursor: pointer;
  border: 1px solid var(--td-component-border);
  transition: border-color 150ms ease, background 150ms ease;
}

.kind-card.active {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.kind-title {
  margin: 0;
  font-size: 16px;
}

.radio {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: var(--td-radius-circle);
  border: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
}

.radio.on {
  border-color: var(--td-brand-color);
  box-shadow: inset 0 0 0 4px var(--td-brand-color);
}

.tagline {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
}

/* 推进流程：步骤 chips + 箭头 */
.process {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
}

.step {
  font-size: 12px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: var(--td-radius-default);
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}

.arrow {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.bullets {
  margin: 10px 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bullets li {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
}

.cta {
  margin-top: 4px;
}
</style>
