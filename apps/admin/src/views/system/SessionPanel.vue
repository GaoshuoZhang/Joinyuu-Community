<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { SearchIcon } from 'tdesign-icons-vue-next'
import { fetchSessions, kickAllSessions, kickSession, type AdminSession } from '@/api/auth'
import { resetAuth } from '@/stores/auth'
import { useRouter } from 'vue-router'
const router = useRouter()

/* 在线会话管理：查看在线管理员会话，单会话/一键强制下线（黑名单实时生效，一键下线保留当前会话） */

const loading = ref(true)
const loadError = ref('')
const list = ref<AdminSession[]>([])
const kicking = ref('')
const kickingAll = ref(false)

const keyword = ref('')
const appliedKeyword = ref('')

const filtered = computed(() => {
  const kw = appliedKeyword.value.toLowerCase()
  if (!kw) return list.value
  return list.value.filter(
    (s) =>
      s.username.toLowerCase().includes(kw) ||
      s.name.toLowerCase().includes(kw) ||
      s.ip.toLowerCase().includes(kw),
  )
})

/* 客户端分页：本地全量过滤后切片展示 */
const currentPage = ref(1)
const pageSize = ref(10)

const pageData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: filtered.value.length,
  showJumper: true,
}))

function onPageChange(p: { current: number; pageSize: number }) {
  currentPage.value = p.current
  pageSize.value = p.pageSize
}

/* 过滤后数据变少导致当前页越界时夹到合法页码 */
watch(filtered, () => {
  const maxPage = Math.max(1, Math.ceil(filtered.value.length / pageSize.value))
  if (currentPage.value > maxPage) currentPage.value = maxPage
})

function onQuery() {
  appliedKeyword.value = keyword.value.trim()
  currentPage.value = 1
}

function onResetQuery() {
  keyword.value = ''
  appliedKeyword.value = ''
  currentPage.value = 1
}

/* 空态筛选判定 */
const filterState = computed(() => ({ keyword: appliedKeyword.value }))

const columns = [
  { colKey: 'username', title: '账号', cell: 'username', width: 160 , ellipsis: true},
  { colKey: 'ip', title: 'IP', width: 130 , ellipsis: true},
  { colKey: 'device', title: '设备', width: 200 , ellipsis: true},
  { colKey: 'loginAt', title: '登录时间', width: 170 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 110 },
]

async function load() {
  loading.value = true
  try {
    list.value = await fetchSessions()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

async function onKick(row: AdminSession) {
  kicking.value = row.jti
  try {
    await kickSession(row.jti)
    if (row.current) {
      resetAuth()
      await router.replace('/login')
      return
    }
    MessagePlugin.success(`已强制下线「${row.username}」的该会话`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    kicking.value = ''
  }
}

async function onKickAll() {
  kickingAll.value = true
  try {
    const { kicked } = await kickAllSessions()
    MessagePlugin.success(kicked > 0 ? `已强制下线 ${kicked} 个会话（当前会话保留）` : '当前没有其他在线会话')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    kickingAll.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="session-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />

    <div class="page-filter-bar">
      <t-input v-accessible-field="'搜索账号/姓名/IP'" v-model="keyword" class="ctl-w-xl" placeholder="搜索账号/姓名/IP…" clearable @enter="onQuery" />
      <t-button theme="primary" variant="outline" @click="onQuery">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onResetQuery">
        重置
      </t-button>
      <t-popconfirm content="确认强制下线其余全部在线会话？你当前的会话将保留。" @confirm="onKickAll">
        <t-button variant="outline" theme="danger" class="toolbar-right" :loading="kickingAll">
          一键强制下线
        </t-button>
      </t-popconfirm>
    </div>

    <div class="page-card">
      <t-table
        row-key="jti"
        table-layout="fixed"
        hover
        resizable
        :data="pageData"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        @page-change="onPageChange"
      >
        <template #username="{ row }">
          <div class="user-cell">
            <span class="user-name">{{ row.username }} <t-tag v-if="row.current" size="small" theme="primary">当前会话</t-tag></span>
            <span class="user-sub">{{ row.name }}</span>
          </div>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-popconfirm :content="row.current ? '确认退出当前会话？操作后将立即返回登录页。' : '确认强制下线该会话？'" @confirm="onKick(row)">
              <t-button variant="text" size="small" theme="danger" :loading="kicking === row.jti">
                强制下线
              </t-button>
            </t-popconfirm>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="filterState" description="暂无在线会话" @clear="onResetQuery" />
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
