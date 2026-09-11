<script setup lang="ts">
import { useRouter } from 'vue-router'

/* 403 无权限页：路由 meta.perm 校验失败时落地 */
const router = useRouter()
</script>

<template>
  <div class="forbidden page-fade-in">
    <t-empty description="无权限访问该页面，请联系管理员开通权限">
      <template #image>
        <div class="code">403</div>
      </template>
    </t-empty>
    <t-button theme="primary" variant="outline" @click="router.push('/dashboard')">返回工作台</t-button>
  </div>
</template>

<style scoped>
.forbidden {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 120px;
}

.code {
  font-size: 48px;
  font-weight: 700;
  color: var(--td-text-color-secondary);
}
</style>