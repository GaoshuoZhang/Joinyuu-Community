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

/* 库内类名 .t-input--password 自带 letter-spacing: 6px，会把密码占位符字符拉开；
 * 无替代 API，用 :deep 覆盖统一在此处理（升级 tdesign-mobile-vue 时复核该类名是否仍存在）。 */
.accessible-password :deep(.t-input--password) { letter-spacing: 0; }

.visibility-button { width: 44px; min-width: 44px; height: 44px; padding: 0; }
</style>
