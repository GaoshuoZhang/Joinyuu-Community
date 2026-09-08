<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import ArticlePanel from './ArticlePanel.vue'
import ColumnPanel from './ColumnPanel.vue'
import ShowcasePanel from './ShowcasePanel.vue'
import ReadStatsPanel from './ReadStatsPanel.vue'

/* M0-D 运营设施域 · 资讯内容：文章管理 / 栏目管理 / 展示页发布 / 阅读统计 四面板
 * 展示页发布审批自二期起从「申请审批」页迁移至此 */
const activeTab = ref('articles')
</script>

<template>
  <div class="contents-view page-fade-in">
    <PageHeader title="资讯内容" description="社区资讯文章、栏目运营与展示页发布审批" />
    <t-tabs v-model="activeTab" class="module-tabs">
      <t-tab-panel value="articles" label="文章管理">
        <ArticlePanel />
      </t-tab-panel>
      <t-tab-panel value="columns" label="栏目管理">
        <ColumnPanel />
      </t-tab-panel>
      <t-tab-panel value="showcase" label="展示页发布">
        <ShowcasePanel />
      </t-tab-panel>
      <t-tab-panel value="stats" label="阅读统计">
        <ReadStatsPanel />
      </t-tab-panel>
    </t-tabs>
  </div>
</template>

<style scoped>
.module-tabs :deep(.t-tab-panel) {
  padding-top: 16px;
}
</style>
