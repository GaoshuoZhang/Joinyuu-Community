<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchSessions, kickSession, type AdminSession } from '@/api/auth'

/* 在线会话管理：查看在线管理员会话，强制下线（黑名单实时生效） */

const loading = ref(true)
const list = ref<AdminSession[]>([])
const kicking = ref('')

const columns = [
  { colKey: 'username', title: '账号', cell: 'username', width: 160 , ellipsis: true},
  { colKey: 'ip', title: 'IP', width: 130 , ellipsis: true},
  { colKey: 'device', title: '设备', width: 200 , ellipsis: true},
  { colKey: 'loginAt', title: '登录时间', width: 160 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 110 },
]

async function load() {
  loading.value = true
  try {
    list.value = await fetchSessions()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '数据加载失败')
  } finally {
    loading.value = false
  }
}

async function onKick(row: AdminSession) {
  kicking.value = row.jti
  try {
    await kickSession(row.jti)
    MessagePlugin.success(`已强制下线「${row.username}」的该会话`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    kicking.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div class="session-panel page-fade-in">
    <PageHeader title="在线会话" description="当前在线的管理员会话；强制下线后对应令牌立即失效" />

    <div class="page-card">
      <t-table
        row-key="jti"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        empty="暂无在线会话"
      >
        <template #username="{ row }">
          <div class="user-cell">
            <span class="user-name">{{ row.username }}</span>
            <span class="user-sub">{{ row.name }}</span>
          </div>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-popconfirm content="确认强制下线该会话？" @confirm="onKick(row)">
              <t-button variant="text" size="small" theme="danger" :loading="kicking === row.jti">
                强制下线
              </t-button>
            </t-popconfirm>
          </div>
        </template>
      </t-table>
    </div>
  </div>
</template>

<style scoped>
.user-cell {
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.user-sub {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>