<script setup lang="ts">
import { onMounted } from 'vue'
import { Loading } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { fetchExperience } from '@/api/experience'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 我的等级：个人经验/等级（社区个体维度；无社区个体身份时为空态） */
const { data, loading, error, run } = useAsyncList(() => fetchExperience())
onMounted(run)
</script>

<template>
  <div class="page-fade-in experience">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data || !data.records.length" text="绑定社区个体身份后，经验与等级将在这里展示" />
    <template v-else>
      <div class="level-card">
        <div class="level-head">
          <span class="identity">{{ data.identityLabel }}</span>
          <span class="lv">Lv.{{ data.level }} {{ data.levelName }}</span>
        </div>
        <div class="bar">
          <div
            class="fill"
            :style="{ width: Math.min(100, Math.round(((data.records[0]?.balance ?? 0) / Math.max(1, data.nextLevelExp)) * 100)) + '%' }"
          />
        </div>
        <p class="bar-meta">当前 {{ data.records[0]?.balance ?? 0 }} 经验 · 距下一级 {{ data.nextLevelExp }} 经验</p>
      </div>
      <div class="m-card ledger stagger">
        <div v-for="r in data.records" :key="r.id" class="row">
          <div>
            <p class="reason">{{ r.reason }}</p>
            <p class="meta">{{ r.at }}</p>
          </div>
          <span class="delta" :class="{ neg: r.delta < 0 }">{{ r.delta >= 0 ? '+' : '' }}{{ r.delta }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.experience {
  padding: 16px;
}

.state {
  padding: 20px 0;
}

.level-card {
  padding: 18px;
  border-radius: var(--td-radius-large);
  background: var(--client-brand-gradient);
  color: var(--td-text-color-anti);
  margin-bottom: 14px;
}

.level-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.identity {
  font-size: 12px;
  opacity: 0.85;
}

.lv {
  font-size: 16px;
  font-weight: 700;
}

.bar {
  height: 8px;
  border-radius: var(--td-radius-small);
  background: rgba(255, 255, 255, 0.25);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: var(--td-radius-small);
  background: var(--td-text-color-anti);
}

.bar-meta {
  margin: 8px 0 0;
  font-size: 12px;
  opacity: 0.85;
}

.ledger {
  padding: 4px 14px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--td-component-border);
}

.row:last-child {
  border-bottom: none;
}

.reason {
  margin: 0 0 3px;
  font-size: 13px;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.delta {
  font-weight: 700;
  color: var(--td-success-color);
}

.delta.neg {
  color: var(--td-error-color);
}
</style>
