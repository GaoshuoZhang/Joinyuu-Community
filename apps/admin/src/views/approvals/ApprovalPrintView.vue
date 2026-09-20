<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchApplicationPrint } from '@/api/applications'
import { applicationTypeMap, statusMap } from '@/constants/status'
import type { Application } from '@/types'

const applicationStatusMap = statusMap.application as Record<string, { label: string }>

/* 审核单打印页：独立于 AdminLayout 的裸页，window.print + 打印样式 */
const route = useRoute()
const router = useRouter()

const application = ref<Application | null>(null)
const loading = ref(true)

const actionTextMap: Record<string, string> = {
  submit: '提交申请',
  approve: '通过',
  reject: '驳回',
  withdraw: '撤回',
}

function doPrint() {
  window.print()
}

onMounted(async () => {
  try {
    const id = String(route.params.id)
    /* 走专用打印接口详情直取，避免列表 pageSize 上限导致旧记录查不到 */
    const res = await fetchApplicationPrint(id)
    application.value = res.application
  } catch {
    application.value = null
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="print-page">
    <div class="no-print toolbar">
      <t-button variant="outline" @click="router.back()">返回</t-button>
      <t-button theme="primary" @click="doPrint">打印</t-button>
    </div>

    <t-loading :loading="loading" size="small" class="paper">
      <template v-if="!application">
        <div class="empty-tip">未找到审核记录（{{ route.params.id }}）</div>
      </template>

      <template v-else>
        <div class="doc-head">
          <h1 class="doc-title">聚屿社区 · 申请审核单</h1>
          <p class="doc-no">申请编号：{{ application.id }}</p>
        </div>

        <table class="doc-table">
          <tr>
            <td class="label">申请类型</td>
            <td>{{ applicationTypeMap[application.type].label }}</td>
            <td class="label">当前状态</td>
            <td>{{ applicationStatusMap[application.status].label }}</td>
          </tr>
          <tr>
            <td class="label">申请人</td>
            <td>{{ application.applicantName }}<span v-if="application.applicantId"> [{{ application.applicantId }}]</span></td>
            <td class="label">联系电话</td>
            <td>{{ application.applicantPhone }}</td>
          </tr>
          <tr>
            <td class="label">申请对象</td>
            <td colspan="3">{{ application.targetName }}</td>
          </tr>
          <tr>
            <td class="label">提交时间</td>
            <td colspan="3">{{ application.submittedAt }}</td>
          </tr>
        </table>

        <h3 class="doc-section">申请摘要</h3>
        <p class="doc-summary">{{ application.summary }}</p>

        <h3 class="doc-section">申请内容</h3>
        <table class="doc-table">
          <tr v-for="d in application.details" :key="d.label">
            <td class="label detail-label">{{ d.label }}</td>
            <td>
              <template v-if="d.files?.length">
                <div v-for="(f, i) in d.files" :key="i">{{ f.name }}<template v-if="f.url">（{{ f.url }}）</template></div>
              </template>
              <template v-else>{{ d.value }}</template>
            </td>
          </tr>
        </table>

        <h3 class="doc-section">审核记录</h3>
        <table class="doc-table">
          <thead>
            <tr>
              <th class="th-action">动作</th>
              <th>处理人</th>
              <th>备注</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in application.records" :key="i">
              <td>{{ actionTextMap[r.action] ?? r.action }}</td>
              <td>{{ r.operator }}</td>
              <td>{{ r.comment || '无备注' }}</td>
              <td>{{ r.at }}</td>
            </tr>
          </tbody>
        </table>

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

.doc-table td,
.doc-table th {
  border: 1px solid #d9d9d9;
  padding: 8px 12px;
}

.doc-table td.label {
  width: 110px;
  background: #f7f8fa;
  color: #666;
  font-weight: 500;
}

.doc-table td.detail-label {
  width: 140px;
}

.doc-table th {
  background: #f0f2f5;
  text-align: left;
  font-weight: 500;
}

.doc-summary {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.8;
  color: #444;
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