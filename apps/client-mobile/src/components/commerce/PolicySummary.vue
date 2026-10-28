<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, Popup } from 'tdesign-mobile-vue'

const props = withDefaults(
  defineProps<{
    policy: string
    notes?: string[]
    title?: string
  }>(),
  { notes: () => [], title: '退款约定' },
)

const visible = ref(false)
const hasContent = computed(() => Boolean(props.policy.trim() || props.notes.length))
</script>

<template>
  <section v-if="hasContent" class="policy m-card" aria-label="退款约定摘要">
    <div class="policy__head">
      <h2 class="policy__title">{{ title }}</h2>
      <Button size="small" variant="text" aria-haspopup="dialog" @click="visible = true">查看全文</Button>
    </div>
    <p class="policy__summary">{{ policy || '按运营审核结果执行，如有疑问请联系运营。' }}</p>
    <Popup v-model:visible="visible" placement="bottom" :close-on-overlay-click="true">
      <div class="policy__sheet" role="document">
        <h3 class="policy__sheet-title">{{ title }}</h3>
        <p v-if="policy" class="policy__text">{{ policy }}</p>
        <ul v-if="notes?.length" class="policy__notes">
          <li v-for="note in notes" :key="note">{{ note }}</li>
        </ul>
        <Button theme="primary" size="large" block @click="visible = false">我知道了</Button>
      </div>
    </Popup>
  </section>
</template>

<style scoped>
.policy {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.policy__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-3);
}

.policy__title {
  margin: 0;
  font: var(--app-type-emphasis);
  color: var(--td-text-color-primary);
}

.policy__summary {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
  overflow-wrap: anywhere;
}

.policy__sheet {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  padding: var(--app-space-8);
  padding-bottom: calc(var(--app-space-8) + env(safe-area-inset-bottom));
  background: var(--td-bg-color-container);
}

.policy__sheet-title {
  margin: 0;
  font: var(--app-type-section);
}

.policy__text {
  margin: 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.policy__notes {
  margin: 0;
  padding-left: var(--app-space-5);
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}
</style>
