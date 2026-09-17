<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button, Popup, Textarea, Toast } from 'tdesign-mobile-vue'

/* 通用原因抽屉：举报（预设原因 + 补充说明）与申诉（自由填写）共用。
 * 放在 components/ 根目录（shared/ 需保持零组件库依赖）。 */
const props = withDefaults(
  defineProps<{
    visible: boolean
    title: string
    /** 预设原因 chips；为空时仅自由填写 */
    reasons?: string[]
    placeholder?: string
    submitLabel?: string
    maxlength?: number
  }>(),
  { reasons: () => [], placeholder: '请补充说明…', submitLabel: '提交', maxlength: 200 },
)

const emit = defineEmits<{ 'update:visible': [boolean]; submit: [string] }>()

const reason = ref('')
const detail = ref('')

watch(
  () => props.visible,
  (value) => {
    if (value) {
      /* v41：不预选原因，避免误报默认项 */
      reason.value = ''
      detail.value = ''
    }
  },
)

function onSubmit() {
  const text = props.reasons.length ? [reason.value, detail.value.trim()].filter(Boolean).join('：') : detail.value.trim()
  if (!text) {
    /* v38：校验不通过时保持抽屉打开，避免用户已输入内容被清空 */
    Toast('请选择或填写内容')
    return
  }
  emit('submit', text)
  emit('update:visible', false)
}
</script>

<template>
  <Popup :visible="visible" placement="bottom" @update:visible="(v: boolean) => emit('update:visible', v)">
    <div class="reason-sheet">
      <h3 class="sheet-title">{{ title }}</h3>
      <div v-if="reasons.length" class="reason-chips">
        <Button
          v-for="item in reasons"
          :key="item"
          size="small"
          :theme="reason === item ? 'primary' : 'default'"
          :variant="reason === item ? 'base' : 'outline'"
          @click="reason = item"
        >
          {{ item }}
        </Button>
      </div>
      <Textarea v-model="detail" :autosize="{ minRows: 3, maxRows: 6 }" :maxlength="maxlength" :placeholder="placeholder" />
      <div class="sheet-actions">
        <Button variant="outline" block @click="emit('update:visible', false)">取消</Button>
        <Button theme="primary" block @click="onSubmit">{{ submitLabel }}</Button>
      </div>
    </div>
  </Popup>
</template>

<style scoped>
.reason-sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
}

.sheet-title {
  margin: 0;
  font-size: 15px;
}

.reason-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sheet-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
</style>
