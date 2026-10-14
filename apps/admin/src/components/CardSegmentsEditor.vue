<script setup lang="ts">
const model = defineModel<Record<string, string>[]>({ required: true })
const props = defineProps<{ fields: { key: string; label: string }[] }>()
function add() { model.value = [...model.value, Object.fromEntries(props.fields.map(f => [f.key, '']))] }
function remove(index: number) { model.value = model.value.filter((_, i) => i !== index) }
</script>
<template>
  <div class="segments">
    <div v-for="(row, index) in model" :key="index" class="segment">
      <t-input v-accessible-field="`${field.label} ${index + 1}`" v-for="field in fields" :key="field.key" v-model="row[field.key]" :label="field.label" :aria-label="`${field.label} ${index + 1}`" :maxlength="300" />
      <!-- 删除即从 model 移除并随保存落库，补二次确认 -->
      <t-popconfirm :confirm-btn="{ content: '删除', theme: 'danger' }" content="确认删除该条目？" @confirm="remove(index)">
        <t-button variant="text" theme="danger">删除此项</t-button>
      </t-popconfirm>
    </div>
    <t-button variant="outline" @click="add">新增条目</t-button>
  </div>
</template>
<style scoped>
.segments, .segment { display: flex; flex-direction: column; gap: var(--td-comp-margin-s); width: 100%; }
.segment { padding: var(--td-comp-paddingTB-m); border: 1px solid var(--td-component-border); border-radius: var(--td-radius-default); }
</style>
