<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchLeases, deriveLeaseStatus } from '@/api/workstations'
import type { Lease } from '@/types'

/* 租约打印页：独立于 AdminLayout 的裸页，window.print + 打印样式；可从租约列表操作列进入 */
const route = useRoute()
const router = useRouter()

const lease = ref<Lease | null>(null)
const loading = ref(true)
const notFound = ref(false)

const renterTypeLabel: Record<string, string> = {
  enterprise: '社区企业',
  individual: '社区个体',
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

onMounted(async () => {
  try {
    const list = await fetchLeases()
    lease.value = list.find((l) => l.id === String(route.params.id)) ?? null
    notFound.value = !lease.value
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="print-page">
    <!-- 打印工具条（print 时隐藏） -->
    <div class="no-print toolbar">
      <t-button variant="outline" @click="router.back()">返回</t-button>
      <t-button theme="primary" @click="doPrint">打印</t-button>
    </div>

    <div v-loading="loading" class="paper">
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
            <td>¥{{ lease.monthlyRent.toLocaleString() }} / 月</td>
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
          <li>本确认单为租赁双方就办公位使用权达成的书面约定，自办公位交付之日起生效。</li>
          <li>租金按租赁周期支付，逾期未缴将按社区《办公位管理办法》处理。</li>
          <li>如需终止租约，请与空间运营联系办理交接手续，终止后办公位即时释放。</li>
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
    </div>
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