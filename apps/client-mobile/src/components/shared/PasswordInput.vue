<script setup lang="ts">
import { ref } from 'vue'
import type { Directive } from 'vue'
import { Button, Icon, Input } from 'tdesign-mobile-vue'

defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ disabled?: boolean; autocomplete?: string }>(), { autocomplete: 'current-password' })
const value = defineModel<string | number>({ default: '' })
const visible = ref(false)
// 此版本 Input 将任意 autocomplete 字符串转为 On，显式保留密码管理器所需 token。
const applyAutocomplete = (el: HTMLElement, binding: { value: string }) => el.querySelector('input')?.setAttribute('autocomplete', binding.value)
const vNativeAutocomplete: Directive<HTMLElement, string> = { mounted: applyAutocomplete, updated: applyAutocomplete }
</script>

<template>
  <Input v-bind="$attrs" v-model="value" v-native-autocomplete="autocomplete" class="accessible-password" :disabled="disabled" :type="visible ? 'text' : 'password'">
    <template #suffix>
      <Button class="visibility-button" variant="text" shape="square" :disabled="disabled" :aria-label="visible ? '隐藏密码' : '显示密码'" :aria-pressed="visible" @click="visible = !visible">
        <Icon aria-hidden="true" :name="visible ? 'browse' : 'browse-off'" size="24px" />
      </Button>
    </template>
  </Input>
</template>

<style scoped>
/* 当前库的内建眼睛图标无键盘语义，由具名 Button 提供同一操作。 */
.accessible-password :deep(.t-input__wrap--suffix-icon) { display: none; }
.visibility-button { width: 44px; min-width: 44px; height: 44px; padding: 0; }
</style>
