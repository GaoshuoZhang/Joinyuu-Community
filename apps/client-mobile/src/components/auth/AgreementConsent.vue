<script setup lang="ts">
import { ref } from 'vue'
import { Button, Checkbox, Popup } from 'tdesign-mobile-vue'
import PrivacyView from '@/views/mobile/PrivacyView.vue'

/* 协议勾选（合规留痕 UI）：登录页「验证码登录」与兜底注册页共用。
 * 勾选状态由 v-model 承载；协议全文走底部弹层（PrivacyView），不新增页面。 */
withDefaults(defineProps<{ modelValue: boolean; tip?: string; disabled?: boolean }>(), {
  tip: '',
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const policyVisible = ref(false)
</script>

<template>
  <div class="agreement">
    <div class="agreement-row">
      <Checkbox
        :checked="modelValue"
        :borderless="true"
        :disabled="disabled"
        aria-label="我已阅读并同意用户协议与隐私政策"
        @change="(value: unknown) => emit('update:modelValue', Boolean(value))"
      />
      <span class="agreement-text">我已阅读并同意</span>
      <Button variant="text" class="agreement-link" :disabled="disabled" @click="policyVisible = true">《用户协议》与《隐私政策》</Button>
    </div>
    <p v-if="tip" class="agreement-tip">{{ tip }}</p>
    <Popup v-model:visible="policyVisible" placement="bottom" class="policy-popup" aria-label="用户协议与隐私政策">
      <div class="policy-popup-body">
        <div class="policy-popup-head"><h2>用户协议与隐私政策</h2><Button variant="text" aria-label="关闭协议" @click="policyVisible = false">关闭</Button></div>
        <PrivacyView />
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.agreement {
  width: 100%;
  min-width: 0;
}

.agreement-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap:var(--app-space-2);
}

.agreement-text {
  white-space: nowrap;
}

/* 文字链撑到 44px 命中区并左对齐（与勾选框同行） */
.agreement-link {
  min-height: 44px;
  justify-content: flex-start;
  padding: 0;
}

.agreement-tip {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.policy-popup {
  width: 100%;
}

.policy-popup-body {
  max-height: 90dvh;
  overflow-y: auto;
  padding: var(--app-space-6) var(--app-space-7) env(safe-area-inset-bottom);
}

.policy-popup-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-4);
  background: var(--td-bg-color-container);
}

.policy-popup-head h2 {
  margin: 0;
  font: var(--app-type-section);
}
</style>
