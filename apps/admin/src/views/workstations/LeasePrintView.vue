<script setup lang="ts">
import { backOrFallback } from '@/utils/navigation'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ListErrorState from '@/components/ListErrorState.vue'
import { deriveLeaseStatus, fetchLeasePrint } from '@/api/workstations'
import { isNotFound } from '@/api/http'
import { useBrandingStore } from '@/stores/branding'
import { LEASE_PRINT_FIELDS, isLeasePrintFieldEnabled } from '@/constants/leasePrintLayout'
import type { Lease } from '@/types'

/* 租约打印页：独立于 AdminLayout 的裸页，window.print + 打印样式；可从租约列表操作列进入。
 * 单据数据取自 GET /api/admin/leases/:id/print（标题 + 租约 + 条款），不再拉取整表。 */
const route = useRoute()
const router = useRouter()
const branding = useBrandingStore()

const lease = ref<Lease | null>(null)
const clauses = ref<string[]>([])
/* 打印版式（服务端下发）：标题与「租赁信息」栏目可见性 */
const docTitle = ref('')
const fields = ref<Record<string, boolean>>({})
const loading = ref(true)
const notFound = ref(false)
/* 非 404 的加载失败：展示错误与重试入口（403/500/断网不再伪装成「未找到」） */
const loadError = ref('')

const renterTypeLabel: Record<string, string> = {
  enterprise: '社区企业',
  individual: '个人用户',
  custom: '其他（自建）',
}

const rentPeriodLabel: Record<string, string> = {
  day: '按日',
  week: '按周',
  month: '按月',
  year: '按年',
}

const statusLabel: Record<string, string> = {
  active: '生效中',
  expiring: '即将到期',
  expired: '已到期',
  terminated: '已终止',
}

/* ---------- 「租赁信息」按打印版式成行 ----------
 * 规则：非独占栏目按目录顺序两两成行，独占栏目（办公位 / 终止日期）各占整行；
 * 无值的栏目（如未终止时的「终止日期」）整条跳过；未知键忽略（两端键集不一致时不渲染空栏目）。
 * 全部勾选时输出与改造前一致的 6 行版式。 */
interface PrintCell {
  label: string
  value: string
}

const rentUnitLabel = computed(
  () => ({ day: '日', week: '周', month: '月', year: '年' })[lease.value?.rentPeriod ?? 'month'],
)

function printCellOf(key: string): PrintCell | null {
  const l = lease.value
  if (!l) return null
  switch (key) {
    case 'renterName':
      return { label: '租赁方', value: l.enterpriseId ? `${l.enterpriseName} [${l.enterpriseId}]` : l.enterpriseName }
    case 'renterType':
      return { label: '租赁方类型', value: renterTypeLabel[l.renterType ?? 'custom'] ?? l.renterType ?? '' }
    case 'contactName':
      return { label: '联系人', value: l.contactName }
    case 'contactPhone':
      return { label: '联系电话', value: l.contactPhone }
    case 'workstation':
      return { label: '办公位', value: l.workstationLabels.join('、') }
    case 'leaseTerm':
      return { label: '租期', value: `${l.startDate} 至 ${l.longTerm ? '长期' : l.endDate}` }
    case 'rentPeriod':
      return { label: '租赁周期', value: rentPeriodLabel[l.rentPeriod ?? 'month'] ?? l.rentPeriod ?? '' }
    case 'rent':
      return { label: `${rentUnitLabel.value}租金`, value: `¥${l.monthlyRent.toLocaleString('zh-CN')}` }
    case 'status':
      return { label: '状态', value: statusLabel[deriveLeaseStatus(l)] ?? l.status }
    case 'terminatedAt':
      return l.terminatedAt ? { label: '终止日期', value: l.terminatedAt } : null
    default:
      return null
  }
}

const printRows = computed<PrintCell[][]>(() => {
  const rows: PrintCell[][] = []
  let pending: PrintCell[] = []
  const flush = () => {
    if (pending.length) {
      rows.push(pending)
      pending = []
    }
  }
  for (const field of LEASE_PRINT_FIELDS) {
    if (!isLeasePrintFieldEnabled(fields.value, field.key)) continue
    const cell = printCellOf(field.key)
    if (!cell) continue
    if (field.wide) {
      flush()
      rows.push([cell])
      continue
    }
    pending.push(cell)
    if (pending.length === 2) flush()
  }
  flush()
  return rows
})

/* 打印回落浅色：本页颜色一律取 TDesign token，暗色主题下这些 token 会解析成深色值
 * （--td-bg-color-container = 深灰），直接打印就是黑底白字。因此在「打印」这一瞬间
 * 摘掉 :root 的 theme-mode 属性，让 token 回落到浅色取值；打印结束后按打印前的实际
 * 属性还原。全程只操作 DOM 属性，不改 localStorage、不调用 theme store，
 * 因此与 stores/theme.ts 的持久化状态互不冲突。 */
let restoreThemeMode = false

function enterPrintLight() {
  restoreThemeMode = document.documentElement.getAttribute('theme-mode') === 'dark'
  if (restoreThemeMode) {
    document.documentElement.removeAttribute('theme-mode')
    document.documentElement.style.colorScheme = 'light'
  }
}

function restoreAppTheme() {
  if (restoreThemeMode) {
    document.documentElement.setAttribute('theme-mode', 'dark')
    document.documentElement.style.colorScheme = 'dark'
  }
  restoreThemeMode = false
}

function doPrint() {
  if (loading.value || loadError.value || !lease.value) return
  window.print()
}

async function load() {
  loading.value = true
  loadError.value = ''
  notFound.value = false
  lease.value = null
  try {
    const payload = await fetchLeasePrint(String(route.params.id))
    lease.value = payload.lease
    clauses.value = payload.clauses ?? []
    docTitle.value = payload.title
    fields.value = payload.fields ?? {}
    notFound.value = !lease.value
  } catch (e) {
    /* 404 = 记录不存在；其余错误保留具体原因并给出重试入口 */
    if (isNotFound(e)) notFound.value = true
    else loadError.value = e instanceof Error ? e.message : '租约打印数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  /* beforeprint/afterprint 同时覆盖「右上角打印按钮」与浏览器自带打印（Ctrl+P）两条路径 */
  window.addEventListener('beforeprint', enterPrintLight)
  window.addEventListener('afterprint', restoreAppTheme)
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', enterPrintLight)
  window.removeEventListener('afterprint', restoreAppTheme)
  /* 兜底：中途离开页面（浏览器未派发 afterprint）时也要还原主题 */
  restoreAppTheme()
})
</script>

<template>
  <div class="print-page">
    <!-- 打印工具条（print 时隐藏） -->
    <div class="no-print toolbar">
      <t-button variant="outline" @click="backOrFallback(router, '/workstations/leases')">返回</t-button>
      <t-button theme="primary" :loading="loading" :disabled="loading || !!loadError || !lease" @click="doPrint">打印</t-button>
    </div>

    <t-loading :loading="loading" size="small" class="paper">
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

      <template v-if="notFound">
        <div class="empty-tip">未找到租约记录（{{ route.params.id }}）</div>
      </template>

      <template v-else-if="!loadError && lease">
        <div class="doc-head">
          <h1 class="doc-title">{{ docTitle }}</h1>
          <p class="doc-no">租约编号：{{ lease.id }}</p>
        </div>

        <h3 class="doc-section">租赁信息</h3>
        <table class="doc-table">
          <tr v-for="(row, index) in printRows" :key="index">
            <template v-if="row.length === 2">
              <td class="label">{{ row[0].label }}</td>
              <td>{{ row[0].value }}</td>
              <td class="label">{{ row[1].label }}</td>
              <td>{{ row[1].value }}</td>
            </template>
            <template v-else>
              <td class="label">{{ row[0].label }}</td>
              <td :colspan="3">{{ row[0].value }}</td>
            </template>
          </tr>
        </table>

        <h3 class="doc-section">条款说明</h3>
        <ol class="doc-tips">
          <li v-for="(clause, index) in clauses" :key="index">{{ clause }}</li>
        </ol>

        <div class="sign-row">
          <div class="sign-cell">
            <p>出租方（空间运营）：</p>
            <p class="sign-space"></p>
            <p>日期：____年____月____日</p>
          </div>
          <div class="sign-cell">
            <p>承租方（{{ lease.enterpriseName }}<template v-if="lease.enterpriseId"> [{{ lease.enterpriseId }}]</template>）：</p>
            <p class="sign-space"></p>
            <p>日期：____年____月____日</p>
          </div>
        </div>

        <p class="doc-foot">本单据由{{ branding.siteName }}管理后台生成，仅供存档。</p>
      </template>
    </t-loading>
  </div>
</template>

<style scoped>
.print-page {
  padding: 16px;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 16px;
}

.paper {
  max-width: 820px;
  margin: 0 auto;
  padding: 48px 56px;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-primary);
  box-shadow: var(--td-shadow-2);
}

.empty-tip {
  padding: 60px 0;
  text-align: center;
  color: var(--td-text-color-placeholder);
}

.doc-head {
  text-align: center;
  border-bottom: 2px solid var(--td-text-color-primary);
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.doc-title {
  margin: 0;
  font-size: 24px;
  letter-spacing: 2px;
}

.doc-no {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* 单据样式全部走 TDesign token：屏幕预览随应用主题，打印时由 enterPrintLight()
 * 把 :root 回落到浅色取值，故此处不再为打印稿单独固定灰阶 */
.doc-section {
  margin: 24px 0 10px;
  font-size: 16px;
  border-left: 4px solid var(--td-brand-color);
  padding-left: 8px;
}

.doc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.doc-table td {
  border: 1px solid var(--td-component-border);
  padding: 8px 12px;
}

.doc-table td.label {
  width: 110px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
  font-weight: 500;
}

.doc-tips {
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.sign-row {
  display: flex;
  gap: 80px;
  margin-top: 56px;
}

.sign-cell {
  flex: 1;
  font-size: 14px;
}

.sign-space {
  height: 48px;
}

.doc-foot {
  margin-top: 40px;
  text-align: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

@media print {
  .print-page {
    padding: 0;
  }

  .no-print {
    display: none !important;
  }

  .paper {
    max-width: none;
    margin: 0;
    padding: 24px 32px;
    box-shadow: none;
    /* 浏览器默认不打印背景色，表头与标签列底纹会丢失 */
    print-color-adjust: exact;
  }
}
</style>
