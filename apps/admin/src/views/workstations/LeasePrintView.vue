<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ListErrorState from '@/components/ListErrorState.vue'
import { deriveLeaseStatus, fetchLeasePrint } from '@/api/workstations'
import { isNotFound } from '@/api/http'
import type { Lease } from '@/types'

/* 租约打印页：独立于 AdminLayout 的裸页，window.print + 打印样式；可从租约列表操作列进入。
 * 单据数据取自 GET /api/admin/leases/:id/print（标题 + 租约 + 条款），不再拉取整表。 */
const route = useRoute()
const router = useRouter()

const lease = ref<Lease | null>(null)
const clauses = ref<string[]>([])
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

function doPrint() {
  window.print()
}

async function load() {
  loading.value = true
  loadError.value = ''
  notFound.value = false
  try {
    const payload = await fetchLeasePrint(String(route.params.id))
    lease.value = payload.lease
    clauses.value = payload.clauses ?? []
    notFound.value = !lease.value
  } catch (e) {
    /* 404 = 记录不存在；其余错误保留具体原因并给出重试入口 */
    if (isNotFound(e)) notFound.value = true
    else loadError.value = e instanceof Error ? e.message : '租约打印数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="print-page">
    <!-- 打印工具条（print 时隐藏） -->
    <div class="no-print toolbar">
      <t-button variant="outline" @click="router.back()">返回</t-button>
      <t-button theme="primary" @click="doPrint">打印</t-button>
    </div>

    <t-loading :loading="loading" size="small" class="paper">
      <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

      <template v-if="notFound">
        <div class="empty-tip">未找到租约记录（{{ route.params.id }}）</div>
      </template>

      <template v-else-if="lease">
        <div class="doc-head">
          <h1 class="doc-title">聚屿社区 · 办公位租约确认单</h1>
          <p class="doc-no">租约编号：{{ lease.id }}</p>
        </div>

        <h3 class="doc-section">租赁信息</h3>
        <table class="doc-table">
          <tr>
            <td class="label">租赁方</td>
            <td>{{ lease.enterpriseName }}<template v-if="lease.enterpriseId"> [{{ lease.enterpriseId }}]</template></td>
            <td class="label">租赁方类型</td>
            <td>{{ renterTypeLabel[lease.renterType ?? 'custom'] ?? lease.renterType }}</td>
          </tr>
          <tr>
            <td class="label">联系人</td>
            <td>{{ lease.contactName }}</td>
            <td class="label">联系电话</td>
            <td>{{ lease.contactPhone }}</td>
          </tr>
          <tr>
            <td class="label">办公位</td>
            <td :colspan="3">{{ lease.workstationLabels.join('、') }}</td>
          </tr>
          <tr>
            <td class="label">租期</td>
            <td>{{ lease.startDate }} 至 {{ lease.longTerm ? '长期' : lease.endDate }}</td>
            <td class="label">租赁周期</td>
            <td>{{ rentPeriodLabel[lease.rentPeriod ?? 'month'] ?? lease.rentPeriod }}</td>
          </tr>
          <tr>
            <td class="label">月租金</td>
            <td>¥{{ lease.monthlyRent.toLocaleString('zh-CN') }} / 月</td>
            <td class="label">状态</td>
            <td>{{ statusLabel[deriveLeaseStatus(lease)] ?? lease.status }}</td>
          </tr>
          <tr v-if="lease.terminatedAt">
            <td class="label">终止日期</td>
            <td :colspan="3">{{ lease.terminatedAt }}</td>
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

        <p class="doc-foot">本单据由聚屿社区管理后台生成，仅供存档。</p>
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
  background: #fff;
  color: #333;
  box-shadow: var(--td-shadow-2);
}

.empty-tip {
  padding: 60px 0;
  text-align: center;
  color: var(--td-text-color-placeholder);
}

.doc-head {
  text-align: center;
  border-bottom: 2px solid #333;
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
  font-size: 13px;
  color: #666;
}

.doc-section {
  margin: 24px 0 10px;
  font-size: 15px;
  border-left: 4px solid #0052d9;
  padding-left: 8px;
}

.doc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.doc-table td {
  border: 1px solid #d9d9d9;
  padding: 8px 12px;
}

.doc-table td.label {
  width: 110px;
  background: #f7f8fa;
  color: #666;
  font-weight: 500;
}

.doc-tips {
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.9;
  color: #555;
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
  color: #999;
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
  }
}
</style>
