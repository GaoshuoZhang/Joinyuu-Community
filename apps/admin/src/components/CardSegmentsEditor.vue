<script setup lang="ts">
const model = defineModel<Record<string, string>[]>({ required: true })
const props = defineProps<{ fields: { key: string; label: string }[] }>()
function add() { model.value = [...model.value, Object.fromEntries(props.fields.map(f => [f.key, '']))] }
function remove(index: number) { model.value = model.value.filter((_, i) => i !== index) }
</script>
<template>
  <div class="segments">
    <div v-for="(row, index) in model" :key="index" class="segment">
      <t-input v-for="field in fields" :key="field.key" v-model="row[field.key]" :label="field.label" :aria-label="`${field.label} ${index + 1}`" :maxlength="300" />
      <t-button variant="text" theme="danger" @click="remove(index)">删除此项</t-button>
    </div>
    <t-button variant="outline" @click="add">新增条目</t-button>
  </div>
</template>
<style scoped>
.segments, .segment { display: flex; flex-direction: column; gap: var(--td-comp-margin-s); width: 100%; }
.segment { padding: var(--td-comp-paddingTB-m); border: 1px solid var(--td-component-border); border-radius: var(--td-radius-default); }
</style>
