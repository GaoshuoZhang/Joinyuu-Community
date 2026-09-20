<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, Radio, Tag, Toast } from 'tdesign-mobile-vue'
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
  if (!selected.value) {
    Toast('请先选择需求类型')
    return
  }
  void router.push(FORM_ROUTES[selected.value])
}
</script>

<template>
  <div class="publish-hub page-fade-in" :class="{ 'has-fixed-actions': demandOpen }">
    <div v-if="!demandOpen">
      <EmptyBlock text="发布功能暂未开放" />
    </div>

    <template v-else>
      <header class="head">
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
          <Radio
            class="kind-radio"
            :checked="selected === item.kind"
            :aria-label="`选择${item.title}`"
            @click.stop
            @change="selected = item.kind"
          />
        </div>
        <p class="tagline">{{ item.tagline }}</p>
        <div class="process">
          <template v-for="(s, i) in item.process" :key="s">
            <Tag class="step" size="small" variant="light" theme="primary">{{ s }}</Tag>
            <Icon aria-hidden="true" v-if="i < item.process.length - 1" name="chevron-right" size="12px" class="arrow" />
          </template>
        </div>
        <ul class="bullets">
          <li v-for="b in item.bullets" :key="b">{{ b }}</li>
        </ul>
      </section>

      <Button theme="primary" variant="text" block @click="router.push('/me/demands')">
        查看我的需求
        <template #suffix><Icon aria-hidden="true" name="chevron-right" size="14px" /></template>
      </Button>
      <Teleport to="body">
        <div class="mobile-fixed-action-bar publish-actions">
          <Button theme="primary" block size="large" :disabled="!selected" @click="goForm">
            {{ ctaText }}
          </Button>
        </div>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.publish-hub {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.publish-hub.has-fixed-actions {
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

.publish-actions {
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
  box-shadow: var(--app-action-bar-shadow);
}

.head {
  padding:0 var(--app-space-1);
}

.head .desc {
  margin:0;
  font-size: var(--app-font-caption);
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
  gap:var(--app-space-5);
}

.kind-title {
  margin:0;
  font-size: var(--app-font-subtitle);
}

.kind-radio {
  display: inline-flex;
  width: auto;
  flex-shrink: 0;
}

.tagline {
  margin:var(--app-space-4) 0 0;
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
  line-height: 1.6;
}

/* 推进流程：步骤 chips + 箭头 */
.process {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap:var(--app-space-2);
  margin-top:var(--app-space-5);
}

.arrow {
  color: var(--td-text-color-placeholder);
}

.bullets {
  margin:var(--app-space-5) 0 0;
  padding-left:var(--app-space-9);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-2);
}

.bullets li {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
  line-height: 1.6;
}

</style>
