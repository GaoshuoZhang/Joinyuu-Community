<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { firstAccessiblePath } from '@/router'

/* 403 无权限页：路由 meta.perm 校验失败时落地 */
const route = useRoute()
const router = useRouter()

/* 返回「首个可访问首页」；若当前已在 403（无任何可访问页面）则禁用，避免跳回自身形成死循环 */
const homePath = computed(() => firstAccessiblePath())
const canGoHome = computed(() => homePath.value !== route.path)
</script>

<template>
  <div class="forbidden page-fade-in">
    <t-empty description="无权限访问该页面，请联系管理员开通权限">
      <template #image>
        <div class="code">403</div>
      </template>
    </t-empty>
    <t-button theme="primary" variant="outline" :disabled="!canGoHome" @click="router.push(homePath)">返回可访问首页</t-button>
  </div>
</template>

<style scoped>
.forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  /* 垂直居中而非固定上边距：窄屏/短视口下不会被挤压错位 */
  min-height: 60vh;
  padding: 24px 16px;
}

.code {
  font-size: 48px;
  font-weight: 700;
  color: var(--td-text-color-secondary);
}
</style>