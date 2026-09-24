<script setup lang="ts">
import { ref, watch } from 'vue'
import { Button, Icon, Rate, Textarea } from 'tdesign-mobile-vue'

/* 活动结束后的反馈表单：已提交回显或评分+建议。 */
defineProps<{ submitted: boolean; submitting: boolean }>()
const emit = defineEmits<{ feedback: [payload: { rating: number; comment: string }] }>()

const rating = ref(5)
const comment = ref('')
const ratingError = ref('')
watch(rating, () => (ratingError.value = ''))

function submit() {
  /* 未评分时给出可见的行内校验反馈（不改变评分默认值与口径） */
  if (!rating.value) {
    ratingError.value = '请先选择评分'
    return
  }
  ratingError.value = ''
  emit('feedback', { rating: rating.value, comment: comment.value.trim() })
}
</script>

<template>
  <p v-if="submitted" class="status-line ok"><Icon aria-hidden="true" name="check-circle" size="16px" />已提交反馈，感谢你的评价</p>
  <template v-else>
    <p class="fb-label">活动反馈</p>
    <div class="fb-field">
      <span class="fb-field-label">评分</span>
      <Rate v-model="rating" :count="5" aria-label="活动评分" />
    </div>
    <Textarea
      v-model="comment"
      label="补充建议（选填）"
      layout="vertical"
      :autosize="{ minRows: 2, maxRows: 4 }"
      :maxlength="200"
      placeholder="活动体验如何？欢迎留下建议…"
    />
    <p v-if="ratingError" class="field-error">{{ ratingError }}</p>
    <Button theme="primary" block :loading="submitting" @click="submit">
      提交反馈
    </Button>
  </template>
</template>

<style scoped>
.fb-label {
  margin: 0 0 var(--app-space-4);
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.fb-field {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-2);
}

.fb-field-label {
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

.status-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.status-line.ok {
  color: var(--td-success-color);
}
</style>
