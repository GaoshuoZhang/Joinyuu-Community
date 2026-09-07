<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const planned = computed(() => (route.meta.planned as string[]) ?? [])
</script>

<template>
  <div class="coming-soon page-fade-in">
    <div class="page-card">
      <t-empty description=" ">
        <template #image>
          <div class="cs-mark">II</div>
        </template>
        <div class="cs-body">
          <h3 class="cs-title">{{ route.meta.title }} — 第二轮交付</h3>
          <p class="cs-desc">该模块属于运营设施批次，将在管理后台原型第二轮中实现。</p>
          <div class="cs-tags">
            <t-tag v-for="item in planned" :key="item" variant="light">{{ item }}</t-tag>
          </div>
        </div>
      </t-empty>
    </div>
  </div>
</template>

<style scoped>
.coming-soon {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 420px;
}

.page-card {
  width: 100%;
  max-width: 560px;
  text-align: center;
}

.cs-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  margin: 0 auto;
  border-radius: 50%;
  border: 2px dashed var(--td-brand-color);
  color: var(--td-brand-color);
  font-size: 22px;
  font-weight: 700;
}

.cs-title {
  margin: 16px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.cs-desc {
  margin: 8px 0 16px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.cs-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
</style>
