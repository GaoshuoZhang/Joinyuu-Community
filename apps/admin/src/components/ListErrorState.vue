<script setup lang="ts">
defineProps<{ message: string; loading?: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <t-alert class="list-error-state" theme="error" title="数据加载失败" :message="message" role="alert" aria-live="assertive">
    <template #operation><t-button size="small" variant="outline" :loading="loading" :disabled="loading" @click="$emit('retry')">重新加载</t-button></template>
  </t-alert>
</template>

<style scoped>
.list-error-state { margin-bottom: var(--td-comp-margin-m); }
</style>
