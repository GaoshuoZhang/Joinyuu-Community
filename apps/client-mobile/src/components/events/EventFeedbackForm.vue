<script setup lang="ts">
import { ref } from 'vue'
import { Button, Icon, Rate, Textarea } from 'tdesign-mobile-vue'

/* 活动结束后的反馈表单：已提交回显或评分+建议。 */
defineProps<{ submitted: boolean; submitting: boolean }>()
const emit = defineEmits<{ feedback: [payload: { rating: number; comment: string }] }>()

const rating = ref(5)
const comment = ref('')
</script>

<template>
  <p v-if="submitted" class="status-line ok"><Icon aria-hidden="true" name="check-circle" size="16px" />已提交反馈，感谢你的评价</p>
  <template v-else>
    <p class="fb-label">活动反馈</p>
    <Rate v-model="rating" :count="5" aria-label="活动评分" />
    <Textarea v-model="comment" :autosize="{ minRows: 2, maxRows: 4 }" :maxlength="200" placeholder="活动体验如何？欢迎留下建议（选填）…" />
    <Button theme="primary" block :loading="submitting" @click="emit('feedback', { rating, comment: comment.trim() })">
      提交反馈
    </Button>
  </template>
</template>

<style scoped>
.fb-label {
  margin: 0 0 var(--app-space-4);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.status-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.status-line.ok {
  color: var(--td-success-color);
}
</style>
