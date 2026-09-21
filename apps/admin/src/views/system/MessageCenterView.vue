<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
    <t-tabs v-model="activeTab" placement="top">
      <t-tab-panel value="channels" label="渠道配置">
        <MessageChannelPanel inline />
      </t-tab-panel>
      <t-tab-panel value="templates" label="模板配置">
        <MessageTemplatePanel inline />
      </t-tab-panel>
      <t-tab-panel value="outbox" label="发送记录">
        <MessageOutboxPanel inline />
      </t-tab-panel>
    </t-tabs>
  </div>
</template>