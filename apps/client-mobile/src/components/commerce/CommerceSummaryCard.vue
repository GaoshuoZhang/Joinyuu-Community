<script setup lang="ts">
import MoneyDisplay from './MoneyDisplay.vue'
import type { CommerceSnapshot } from '@/types'

withDefaults(
  defineProps<{
    snapshot: CommerceSnapshot
    amountFen?: number
    amountLabel?: string
    showAmount?: boolean
    expiresText?: string
  }>(),
  { amountFen: 0, amountLabel: '应付金额', showAmount: true, expiresText: '' },
)
</script>

<template>
  <section class="summary m-card" aria-label="订单摘要">
    <header class="summary__head">
      <div class="summary__titles">
        <h2 class="summary__title">{{ snapshot.title }}</h2>
        <p class="summary__subtitle">{{ snapshot.subtitle }}</p>
      </div>
      <p v-if="expiresText" class="summary__expires" role="timer" aria-live="off">{{ expiresText }}</p>
    </header>
    <dl class="summary__lines">
      <div v-for="line in snapshot.lines" :key="line.label" class="summary__line">
        <dt>{{ line.label }}</dt>
        <dd>{{ line.value }}</dd>
      </div>
    </dl>
    <div v-if="showAmount" class="summary__amount">
      <span class="summary__amount-label">{{ amountLabel }}</span>
      <MoneyDisplay :fen="amountFen" size="lg" />
    </div>
    <ul v-if="snapshot.notes?.length" class="summary__notes">
      <li v-for="note in snapshot.notes" :key="note">{{ note }}</li>
    </ul>
  </section>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  min-width: 0;
}

.summary__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.summary__titles {
  min-width: 0;
}

.summary__title {
  margin: 0;
  font: var(--app-type-card-title);
  color: var(--td-text-color-primary);
  overflow-wrap: anywhere;
}

.summary__subtitle {
  margin: var(--app-space-1) 0 0;
  color: var(--td-text-color-secondary);
  font: var(--app-type-caption);
}

.summary__expires {
  flex: none;
  margin: 0;
  color: var(--td-warning-color);
  font: var(--app-type-emphasis-xs);
  font-variant-numeric: tabular-nums;
}

.summary__lines {
  display: grid;
  gap: var(--app-space-3);
  margin: 0;
}

.summary__line {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: var(--app-space-3);
}

.summary__line dt {
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.summary__line dd {
  margin: 0;
  color: var(--td-text-color-primary);
  font: var(--app-type-body-sm);
  overflow-wrap: anywhere;
}

.summary__amount {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--app-space-4);
  padding-top: var(--app-space-4);
  border-top: 1px solid var(--td-component-border);
}

.summary__amount-label {
  color: var(--td-text-color-secondary);
  font: var(--app-type-body-sm);
}

.summary__notes {
  margin: 0;
  padding-left: var(--app-space-5);
  color: var(--td-text-color-placeholder);
  font: var(--app-type-caption);
}
</style>
