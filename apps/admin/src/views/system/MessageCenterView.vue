<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MessageChannelPanel from './MessageChannelPanel.vue'
import MessageTemplatePanel from './MessageTemplatePanel.vue'
import MessageOutboxPanel from './MessageOutboxPanel.vue'

/* 消息中心（聚合页）：渠道配置 / 模板配置 / 发送记录 三个选项卡，
 * 菜单只保留单一入口「消息中心」，通过 ?tab=channels|templates|outbox 维持刷新与直达。 */

const route = useRoute()
const router = useRouter()

const TAB_KEYS = ['channels', 'templates', 'outbox'] as const

const activeTab = computed<string>({
  get: () => {
    const value = String(route.query.tab ?? 'channels')
    return (TAB_KEYS as readonly string[]).includes(value) ? value : 'channels'
  },
  set: (value: string) => {
    void router.replace({ query: { ...route.query, tab: value } })
  },
})
</script>

<template>
  <div class="message-center page-fade-in">
    <PageHeader
      title="消息中心"
      description="渠道配置、模板配置与发送记录的统一管理：短信 / 邮箱 / 站内信通道、消息模板版本与投递状态"
    />

    <!-- 卡片由聚合壳统一提供（子面板不再自带 t-card）：与「角色与账号」「日志与审计」两个聚合页保持同一层级 -->
    <div class="page-card">
      <t-tabs v-model="activeTab" class="embed-tabs" placement="top">
        <!-- 关闭 destroyOnHide：切 tab 不重建面板，避免重新请求与布局跳动 -->
        <t-tab-panel value="channels" label="渠道配置" :destroy-on-hide="false">
          <MessageChannelPanel />
        </t-tab-panel>
        <t-tab-panel value="templates" label="模板配置" :destroy-on-hide="false">
          <MessageTemplatePanel />
        </t-tab-panel>
        <t-tab-panel value="outbox" label="发送记录" :destroy-on-hide="false">
          <MessageOutboxPanel />
        </t-tab-panel>
      </t-tabs>
    </div>
  </div>
</template>

<style scoped>
/* 依赖 TDesign tabs 内部类 .t-tabs__content：为选项卡与面板内容之间补 8px 留白，与「角色与账号」「日志与审计」聚合页一致 */
.embed-tabs :deep(.t-tabs__content) {
  padding-top: 8px;
}
</style>