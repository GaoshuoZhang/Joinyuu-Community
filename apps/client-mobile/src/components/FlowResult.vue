<script setup lang="ts">
import { Button, Result } from 'tdesign-mobile-vue'

withDefaults(
  defineProps<{
    title: string
    description: string
    reference?: string
    primaryText: string
    secondaryText?: string
  }>(),
  { reference: '', secondaryText: '' },
)

defineEmits<{ primary: []; secondary: [] }>()
</script>

<template>
  <section class="flow-result m-card" role="status" aria-live="polite">
    <Result theme="success" :title="title" :description="description" />
    <p v-if="reference" class="reference tabular-nums">业务编号：{{ reference }}</p>
    <div class="actions">
      <Button theme="primary" size="large" block @click="$emit('primary')">{{ primaryText }}</Button>
      <Button v-if="secondaryText" variant="outline" size="large" block @click="$emit('secondary')">{{ secondaryText }}</Button>
    </div>
  </section>
</template>

<style scoped>
.flow-result {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
  padding: var(--app-space-9) var(--app-space-8);
  text-align: center;
}

.reference {
  margin: 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-body);
  font-variant-numeric: tabular-nums;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}
</style>
