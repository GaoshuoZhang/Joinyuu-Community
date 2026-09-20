<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Textarea, Toast } from 'tdesign-mobile-vue'
import IdentityPicker from '@/components/forms/IdentityPicker.vue'
import { actionIdentityOptions } from '@/stores/auth'
import type { UserIdentity } from '@/types'

/* 响应需求表单：响应说明 + 单选响应身份（标签展示，默认第一个可选身份）；提交后由父级刷新并调用 clearNote。 */
const props = defineProps<{ identities: UserIdentity[]; userName: string; submitting: boolean }>()

const emit = defineEmits<{ respond: [note: string, identity: UserIdentity] }>()

const note = ref('')
const noteError = ref('')
const identityOptions = computed(() => actionIdentityOptions(props.identities))
const picked = ref<UserIdentity | null>(identityOptions.value[0] ?? null)

watch(
  identityOptions,
  (list) => {
    if (!list.some((i) => i.type === picked.value?.type && i.enterpriseId === picked.value?.enterpriseId)) {
      picked.value = list[0] ?? null
    }
  },
  { deep: true },
)

watch(note, () => (noteError.value = ''))

function onSubmit() {
  if (!note.value.trim()) {
    noteError.value = '请输入响应说明'
    Toast(noteError.value)
    return
  }
  if (!picked.value) {
    Toast('请选择响应身份')
    return
  }
  emit('respond', note.value.trim(), picked.value)
}

function clearNote() {
  note.value = ''
}

defineExpose({ clearNote })
</script>

<template>
  <div class="respond-form">
    <div class="note-field">
      <label class="identity-label">响应说明</label>
      <Textarea v-model="note" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="请说明你的方案、经验或可提供的资源…" />
    </div>
    <div v-if="identityOptions.length" class="identity-field">
      <span class="identity-label">响应身份</span>
      <IdentityPicker
        :identities="identityOptions"
        :selected="picked?.type ?? ''"
        :selected-enterprise-id="picked?.enterpriseId ?? ''"
        :user-name="userName"
        @select="picked = $event"
      />
    </div>
    <p v-if="noteError" class="field-error">{{ noteError }}</p>
    <Button theme="primary" block class="submit-btn" :loading="submitting" @click="onSubmit">响应需求</Button>
  </div>
</template>

<style scoped>
.respond-form {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.identity-field,
.note-field {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-3);
}

.identity-label {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}

.submit-btn {
  margin-top: 0;
}
</style>
