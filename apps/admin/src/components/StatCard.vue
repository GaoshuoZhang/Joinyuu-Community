<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  value: number | string
  icon?: Component
}>()
</script>

<template>
  <div class="stat-card">
    <div class="stat-icon">
      <component :is="icon" v-if="icon" />
    </div>
    <div>
      <div class="stat-value">{{ value }}</div>
      <div class="stat-label">{{ label }}</div>
    </div>
  </div>
</template>
