<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import ColumnController from '@/components/ColumnController.vue'
import { useListQueryState } from '@/utils/listQuery'
import { useDialogFormProtection } from '@/utils/form'
import { commerceAction, commerceModules, billableModules, createCommerceBill, createNativePayment, fetchCommerceBill, fetchCommerceBills, fetchCommerceCapabilities, fetchCommerceOptions, moduleLabel, money, fetchCommerceSourcePrice, type CommerceSourcePrice, type CommerceBill, type CommerceCapabilities } from '@/api/commerce'
const query = reactive({ page: 1, pageSize: 10, keyword: '', module: '', status: '', sourceId: '' })
const rows = ref<CommerceBill[]>([]), total = ref(0), loading = ref(false), loadError = ref('')
const capabilities = ref<CommerceCapabilities | null>(null)
const detail = ref<CommerceBill | null>(null), detailVisible = ref(false), detailError = ref(''), detailLoading = ref(false)
const visible = ref(false), saving = ref(false), formError = ref(''), acting = ref(false)
const sourceOptions = ref<Array<{ label: string; value: string }>>([]), buyerOptions = ref<Array<{ label: string; value: string }>>([])
const pricing = ref<CommerceSourcePrice | null>(null), pricingLoading = ref(false), pricingError = ref('')
let pricingSequence = 0
const form = reactive({ module: 'event', sourceId: '', buyerType: 'user', buyerId: '', title: '', period: '', quantity: 1, dueDate: '', agreement: '' })
const billAmount = computed(() => (pricing.value?.amountFen ?? 0) * (form.quantity ?? 0))
async function loadPrice() {
  const version = ++pricingSequence
  pricing.value = null; pricingError.value = ''
  if (!form.sourceId) { pricingLoading.value = false; return }
  pricingLoading.value = true
  try { const result = await fetchCommerceSourcePrice(form.module, form.sourceId); if (version === pricingSequence) pricing.value = result }
  catch (e) { if (version === pricingSequence) pricingError.value = e instanceof Error ? e.message : '业务价格加载失败' }
  finally { if (version === pricingSequence) pricingLoading.value = false }
}
watch(() => [form.module, form.sourceId], () => { form.quantity = 1; void loadPrice() })
const operation = ref(''), operationVisible = ref(false), operationError = ref(''), reference = ref(''), note = ref('')
const operationTarget = ref('')
const qr = ref(''), qrExpires = ref('')
const columns = [
  { colKey: 'title', title: '费用 / 账单', width: 210, ellipsis: true }, { colKey: 'source', title: '关联业务', width: 190, ellipsis: true },
  { colKey: 'buyerName', title: '购买主体', width: 140, ellipsis: true }, { colKey: 'period', title: '账期 / 阶段', width: 120 },
  { colKey: 'amount', title: '应收', width: 130, align: 'right' as const }, { colKey: 'paid', title: '已收 / 已退', width: 150, align: 'right' as const },
  { colKey: 'dueDate', title: '到期日', width: 115 }, { colKey: 'status', title: '收款状态', width: 105 }, { colKey: 'op', title: '操作', width: 90, fixed: 'right' as const },
]
const keys = ref(columns.map(x => x.colKey)), shown = computed(() => keys.value.map(k => columns.find(x => x.colKey === k)!))
const statuses = [{ label: '全部状态', value: '' }, { label: '未缴', value: 'unpaid' }, { label: '已缴', value: 'paid' }, { label: '逾期未缴', value: 'overdue' }, { label: '已作废', value: 'void' }, { label: '已退款', value: 'refunded' }]
let sequence = 0, detailSequence = 0, optionSequence = 0
const { syncQuery } = useListQueryState(query, load)
async function load() {
  const version = ++sequence; loading.value = true; loadError.value = ''; syncQuery()
  try { const result = await fetchCommerceBills(query); if (version === sequence) { rows.value = result.list; total.value = result.total } }
  catch (e) { if (version === sequence) loadError.value = e instanceof Error ? e.message : '加载失败' }
  finally { if (version === sequence) loading.value = false }
}
function search() { query.page = 1; void load() }
function changePage(p: { current: number; pageSize: number }) { query.page = p.current; query.pageSize = p.pageSize; void load() }
function searchSources(keyword: string) { void searchOption('sources', keyword) }
function searchBuyers(keyword: string) { void searchOption('buyers', keyword) }
function reset() { Object.assign(query, { page: 1, keyword: '', module: '', status: '', sourceId: '' }); void load() }
async function openDetail(id: string) {
  const version = ++detailSequence; detailVisible.value = true; detailLoading.value = true; detail.value = null; detailError.value = ''; qr.value = ''
  try { const result = await fetchCommerceBill(id); if (version === detailSequence) detail.value = result }
  catch (e) { if (version === detailSequence) detailError.value = e instanceof Error ? e.message : '详情加载失败' }
  finally { if (version === detailSequence) detailLoading.value = false }
}
async function options() {
  const version = ++optionSequence
  try {
    const [sources, buyers] = await Promise.all([fetchCommerceOptions('sources', { module: form.module }), fetchCommerceOptions('buyers', { type: form.buyerType })])
    if (version === optionSequence) {
      sourceOptions.value = sources.map(x => ({ value: x.id, label: `${x.name} [${x.id}]` }))
      buyerOptions.value = buyers.map(x => ({ value: x.id, label: `${x.name} [${x.id}]` }))
    }
  } catch (e) { if (version === optionSequence) formError.value = e instanceof Error ? e.message : '选项加载失败' }
}
async function searchOption(kind: 'sources' | 'buyers', keyword: string) {
  const version = ++optionSequence
  try {
    const result = await fetchCommerceOptions(kind, { ...(kind === 'sources' ? { module: form.module } : { type: form.buyerType }), keyword })
    if (version === optionSequence) {
      const mapped = result.map(x => ({ value: x.id, label: `${x.name} [${x.id}]` }))
      if (kind === 'sources') sourceOptions.value = mapped; else buyerOptions.value = mapped
    }
  } catch (e) { formError.value = e instanceof Error ? e.message : '选项加载失败' }
}
function create() {
  Object.assign(form, { module: billableModules.some(x => x.value === query.module) ? query.module : 'event', sourceId: billableModules.some(x => x.value === query.module) ? query.sourceId : '', buyerType: 'user', buyerId: '', title: '', period: '', quantity: 1, dueDate: '', agreement: '' })
  sourceOptions.value = []; buyerOptions.value = []; formError.value = ''; visible.value = true; void options(); void loadPrice()
}
async function save() {
  if (saving.value) return
  formError.value = ''
  try {
    if (![form.sourceId, form.buyerId, form.title, form.period, form.dueDate, form.agreement].every(x => x.trim())) throw new Error('请完整填写业务、购买主体、费用、账期、到期日和收费依据')
    if (pricingLoading.value || !pricing.value || pricingError.value) throw new Error('请先加载关联业务的收费配置')
    const amountFen = billAmount.value
    if (!Number.isInteger(form.quantity) || form.quantity < 1 || form.quantity > 10000 || !Number.isSafeInteger(amountFen) || amountFen < 1 || amountFen > 100_000_000) throw new Error('请核对业务收费及计费数量，总额须为 0.01 至 1,000,000.00 元')
    saving.value = true
    const result = await createCommerceBill({ module: form.module, sourceId: form.sourceId, buyerType: form.buyerType, buyerId: form.buyerId, title: form.title, period: form.period, dueDate: form.dueDate, agreement: form.agreement, quantity: form.quantity, amountFen })
    visible.value = false; MessagePlugin.success('账单已创建'); await load(); await openDetail(result.id)
  } catch (e) { formError.value = e instanceof Error ? e.message : '创建失败' } finally { saving.value = false }
}
const { close: closeCreate } = useDialogFormProtection(form, visible, saving)
const operationForm = computed(() => ({ reference: reference.value, note: note.value }))
const { close: closeOperation } = useDialogFormProtection(() => operationForm.value, operationVisible, acting)
function begin(action: string, target = '') { operation.value = action; operationTarget.value = target; reference.value = ''; note.value = ''; operationError.value = ''; operationVisible.value = true }
const operationTitle = computed(() => ({ receipt: '登记线下收款', void: '作废账单', refund: '申请全额退款', approve: '审批并提交全额退款', reject: '驳回退款申请' })[operation.value] ?? '确认操作')
async function perform(path: string, body?: object) {
  if (acting.value || !detail.value) return
  acting.value = true; operationError.value = ''; detailError.value = ''
  const id = detail.value.id
  try {
    await commerceAction(path, body); operationVisible.value = false
    MessagePlugin.success('操作已提交，请以最新处理状态为准')
    if (detailVisible.value && detail.value?.id === id) await openDetail(id)
    await load()
  } catch (e) {
    const message = e instanceof Error ? e.message : '操作失败'
    if (operationVisible.value) operationError.value = message; else detailError.value = message
    try { const fresh = await fetchCommerceBill(id); if (detailVisible.value && detail.value?.id === id) detail.value = fresh } catch { /* Preserve the original action error and existing detail. */ }
  } finally { acting.value = false }
}
function confirmOperation() {
  const bill = detail.value
  if (!bill) return
  if (operation.value === 'receipt') {
    if (!reference.value.trim() || !note.value.trim()) { operationError.value = '请填写凭证编号及实际收款说明'; return }
    void perform(`bills/${bill.id}/receipts`, { reference: reference.value, note: note.value })
  } else if (operation.value === 'approve') void perform(`refunds/${operationTarget.value}/approve`)
  else if (operation.value === 'reject') void perform(`refunds/${operationTarget.value}/reject`)
  else if (operation.value === 'void') void perform(`bills/${bill.id}/void`)
  else {
    const payment = bill.payments?.find(p => p.status === 'success')
    if (!payment || !note.value.trim()) { operationError.value = '请填写退款原因'; return }
    void perform(`payments/${payment.id}/refunds`, { amountFen: payment.amountFen, reason: note.value })
  }
}
async function nativePayment() {
  if (!detail.value || acting.value) return
  const id = detail.value.id, version = detailSequence
  acting.value = true; detailError.value = ''
  try {
    const payment = await createNativePayment(id)
    const image = await QRCode.toDataURL(payment.code_url, { width: 240, margin: 2 })
    const fresh = await fetchCommerceBill(id)
    if (detailVisible.value && version === detailSequence) { qr.value = image; qrExpires.value = new Date(payment.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }); detail.value = fresh }
  } catch (e) {
    if (version === detailSequence) {
      detailError.value = e instanceof Error ? e.message : '创建支付失败'
      try { const fresh = await fetchCommerceBill(id); if (version === detailSequence) detail.value = fresh } catch { /* Preserve error if status refresh also fails. */ }
    }
  } finally { acting.value = false }
}
onMounted(async () => { void load(); try { capabilities.value = await fetchCommerceCapabilities() } catch { /* Server still enforces readiness on every action. */ } })
</script>
<template>
  <div class="commerce-page page-fade-in">
  <PageHeader title="应收与交易" description="价格在各业务新增/编辑页设置，账单按业务单价及数量计算；收款不自动发券、分配办公位或确认预约。">
    <template #actions><t-button v-permission="'perm:commerce:bill:create'" @click="create">新增账单</t-button></template>
  </PageHeader>
  <t-alert v-if="capabilities && !capabilities.enabled" theme="warning" class="commerce-notice" title="微信收款未启用" message="请由系统管理员在“系统配置 → 收款配置”查看参数提示，并完成部署与联调验收。">
    <template #operation><router-link v-permission="'/system/config'" to="/system/config?tab=payment&provider=wechat">查看收款配置</router-link></template>
  </t-alert>
  <t-card>
    <t-space break-line class="commerce-filter">
      <t-input v-model="query.keyword" aria-label="搜索账单" placeholder="账单、业务或购买主体…" clearable @enter="search" />
      <t-select v-model="query.module" aria-label="业务模块" :options="[{ label: '全部模块', value: '' }, ...commerceModules]" @change="() => { query.sourceId = ''; search() }" />
      <t-select v-model="query.status" aria-label="收款状态" :options="statuses" @change="search" />
      <t-button @click="search">查询</t-button>
      <t-button v-if="query.sourceId" variant="outline" @click="() => { query.sourceId = ''; search() }">清除业务编号筛选</t-button>
      <ColumnController v-model="keys" storage-key="commerce-bills" :columns="columns.map(c => ({ key: c.colKey, title: c.title }))" />
    </t-space>
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />
    <t-table :data="rows" :columns="shown" row-key="id" table-layout="fixed" hover :loading="loading">
      <template #title="{ row }">{{ row.title }}<div class="id-tag-block">{{ row.id }}</div></template>
      <template #source="{ row }">{{ moduleLabel(row.module) }} · {{ row.sourceName }}<div class="id-tag-block">{{ row.sourceId }}</div></template>
      <template #amount="{ row }"><span class="commerce-money">{{ money(row.amountFen) }}</span></template>
      <template #paid="{ row }"><span class="commerce-money">{{ money(row.paidFen) }} / {{ money(row.refundedFen) }}</span></template>
      <template #status="{ row }"><StatusTag entity="commerceBill" :value="row.overdue ? 'overdue' : row.status" /></template>
      <template #op="{ row }"><t-button variant="text" theme="primary" @click="openDetail(row.id)">详情</t-button></template>
      <template #empty><ListEmptyState :query="query" @clear="reset" /></template>
    </t-table>
    <div class="commerce-pagination"><span>共 {{ total }} 条数据</span><t-pagination :total-content="false" :current="query.page" :page-size="query.pageSize" :total="total" show-jumper @change="changePage" /></div>
  </t-card>
  <t-dialog :visible="visible" header="新增应收账单" width="640px" :confirm-btn="{ content: '确认出账', loading: saving }" :cancel-btn="{ disabled: saving }" :close-on-overlay-click="false" @close="closeCreate" @confirm="save">
    <t-alert v-if="formError" role="alert" theme="error" :message="formError" />
    <t-form label-align="top" class="commerce-form">
      <t-form-item label="业务模块" required-mark><t-select v-model="form.module" :options="billableModules" @change="() => { form.sourceId = ''; options() }" /></t-form-item>
      <t-form-item label="关联业务（输入名称搜索）" required-mark><t-select v-model="form.sourceId" :options="sourceOptions" filterable :filter="() => true" @search="searchSources" /></t-form-item>
      <t-form-item label="购买主体类型"><t-select v-model="form.buyerType" :options="[{ label: '个人用户', value: 'user' }, { label: '社区企业', value: 'enterprise' }]" @change="() => { form.buyerId = ''; options() }" /></t-form-item>
      <t-form-item label="购买主体（输入名称搜索）" required-mark><t-select v-model="form.buyerId" :options="buyerOptions" filterable :filter="() => true" @search="searchBuyers" /></t-form-item>
      <t-form-item label="费用名称" required-mark><t-input v-model="form.title" :maxlength="128" placeholder="如：会议室使用费、项目首款…" /></t-form-item>
      <t-form-item label="账期 / 阶段（用于防重复出账）" required-mark><t-input v-model="form.period" :maxlength="64" placeholder="如：2026-11 或 第一阶段…" /></t-form-item>
      <t-loading :loading="pricingLoading">
        <t-alert v-if="pricingError" theme="error" :message="pricingError"><template #operation><t-button variant="text" @click="loadPrice">重新读取价格</t-button></template></t-alert>
        <template v-if="pricing">
          <p>业务单价：{{ money(pricing.amountFen) }} / {{ pricing.unit }}。价格在对应业务的新增/编辑页面维护。</p>
          <t-alert v-if="!pricing.amountFen" theme="warning" message="此业务尚未设置现金收费，请先编辑业务费用再出账。" />
          <t-form-item :label="`计费数量（${pricing.unit}）`" required-mark><t-input-number v-model="form.quantity" aria-label="计费数量" :min="1" :max="10000" :decimal-places="0" /></t-form-item>
          <p>应收金额：<strong>{{ money(billAmount) }}</strong>（业务单价 × 数量）</p>
          <p class="commerce-agreement">业务退款约定：{{ pricing.refundPolicy || '未设置' }}</p>
        </template>
      </t-loading>
      <t-form-item label="到期日" required-mark><t-date-picker v-model="form.dueDate" value-type="YYYY-MM-DD" /></t-form-item>
      <t-form-item label="合同依据、交付内容与退款约定" required-mark><t-textarea v-model="form.agreement" :maxlength="2000" /></t-form-item>
    </t-form>
  </t-dialog>
  <t-drawer v-model:visible="detailVisible" header="账单与交易详情" size="760px" :footer="false">
    <t-loading :loading="detailLoading">
      <t-alert v-if="detailError" role="alert" theme="error" :message="detailError" class="commerce-notice" />
      <template v-if="detail">
        <h3>{{ detail.title }} <StatusTag entity="commerceBill" :value="detail.status" /></h3>
        <div class="id-tag-block">{{ detail.id }}</div>
        <t-descriptions :column="2" class="commerce-section" bordered>
          <t-descriptions-item label="关联业务">{{ moduleLabel(detail.module) }} · {{ detail.sourceName }} [{{ detail.sourceId }}]</t-descriptions-item>
          <t-descriptions-item label="购买主体">{{ detail.buyerName }} [{{ detail.buyerId }}]</t-descriptions-item>
          <t-descriptions-item label="账期 / 阶段">{{ detail.period }}</t-descriptions-item><t-descriptions-item label="到期日">{{ detail.dueDate }}</t-descriptions-item>
          <t-descriptions-item label="应收 / 已收">{{ money(detail.amountFen) }} / {{ money(detail.paidFen) }}</t-descriptions-item><t-descriptions-item label="成功退款">{{ money(detail.refundedFen) }}</t-descriptions-item>
        </t-descriptions>
        <p v-if="detail.snapshot.pricing" class="commerce-agreement">出账单价：{{ money(detail.snapshot.pricing.unitAmountFen) }} / {{ detail.snapshot.pricing.unit }} × {{ detail.snapshot.pricing.quantity }}；退款约定：{{ detail.snapshot.pricing.refundPolicy }}</p>
        <p class="commerce-agreement">收费依据：{{ detail.snapshot.agreement }}</p>
        <t-space break-line>
          <t-button v-if="detail.status === 'unpaid'" v-permission="'perm:commerce:payment:create'" :disabled="!capabilities?.enabled || acting" :loading="acting" @click="nativePayment">生成微信收款码</t-button>
          <t-button v-if="detail.status === 'unpaid'" v-permission="'perm:commerce:receipt:create'" variant="outline" :disabled="acting" @click="begin('receipt')">登记线下收款</t-button>
          <t-button v-if="detail.status === 'unpaid'" v-permission="'perm:commerce:bill:create'" theme="danger" variant="outline" :disabled="acting" @click="begin('void')">作废账单</t-button>
          <t-button v-if="detail.payments?.some(p => p.status === 'success') && !detail.refundedFen" v-permission="'perm:commerce:refund:create'" variant="outline" :disabled="acting" @click="begin('refund')">申请全额退款</t-button>
        </t-space>
        <div v-if="qr" class="commerce-qr"><img :src="qr" width="240" height="240" alt="本账单微信支付二维码" /><p>请用微信扫一扫 · 截止 {{ qrExpires }}</p><p>收款结果以渠道确认及下方交易状态为准。</p></div>
        <h4 class="commerce-section">微信交易记录</h4>
        <p v-if="!detail.payments?.length">暂无微信交易记录</p>
        <t-card v-for="payment in detail.payments" :key="payment.id" class="commerce-section" :title="payment.id">
          <t-space><StatusTag entity="commercePayment" :value="payment.status" /><span>{{ money(payment.amountFen) }}</span><t-button v-if="['pending', 'attention'].includes(payment.status)" variant="text" :disabled="acting" @click="perform(`payments/${payment.id}/sync`)">核实付款结果</t-button></t-space>
          <p v-if="payment.transactionId">微信交易号：{{ payment.transactionId }}</p><p v-if="payment.lastError" role="status">{{ payment.lastError }}</p>
          <div v-for="refund in payment.refunds" :key="refund.id" class="commerce-section">
            <p>{{ refund.id }} · {{ money(refund.amountFen) }} · {{ refund.reason }} <StatusTag entity="commerceRefund" :value="refund.status" /></p>
            <t-button v-if="refund.status === 'pending'" v-permission="'perm:commerce:refund:approve'" variant="outline" :disabled="acting" @click="begin('approve', refund.id)">审批并提交退款</t-button>
            <t-button v-if="refund.status === 'pending'" v-permission="'perm:commerce:refund:approve'" variant="text" :disabled="acting" @click="begin('reject', refund.id)">驳回申请</t-button>
            <t-button v-if="['processing', 'abnormal', 'attention'].includes(refund.status)" variant="text" :disabled="acting" @click="perform(`refunds/${refund.id}/sync`)">查询退款结果</t-button>
            <p v-if="refund.lastError" role="status">{{ refund.lastError }}</p>
          </div>
        </t-card>
        <h4 class="commerce-section">线下收款记录</h4>
        <p v-if="!detail.receipts?.length">暂无线下收款记录</p>
        <t-card v-for="receipt in detail.receipts" :key="receipt.id" :title="receipt.reference" class="commerce-section">
          <p>{{ money(receipt.amountFen) }} · {{ receipt.note }} <StatusTag entity="commerceReceipt" :value="receipt.status" /></p><p>登记人：{{ receipt.createdBy }}；复核人：{{ receipt.reviewedBy || '待复核' }}</p>
          <t-space v-if="receipt.status === 'pending'">
            <t-button v-permission="'perm:commerce:receipt:review'" :disabled="acting" @click="perform(`receipts/${receipt.id}/review`, { status: 'approved' })">确认收款</t-button>
            <t-button v-permission="'perm:commerce:receipt:review'" variant="outline" :disabled="acting" @click="perform(`receipts/${receipt.id}/review`, { status: 'rejected' })">驳回登记</t-button>
          </t-space>
        </t-card>
      </template>
    </t-loading>
  </t-drawer>
  <t-dialog :visible="operationVisible" :header="operationTitle" :confirm-btn="{ content: '确认提交', loading: acting }" :cancel-btn="{ disabled: acting }" :close-on-overlay-click="false" @close="closeOperation" @confirm="confirmOperation">
    <t-alert v-if="operationError" role="alert" theme="error" :message="operationError" />
    <p>{{ detail?.title }} · {{ detail ? money(detail.amountFen) : '' }}</p>
    <p v-if="operation === 'void'">确认作废？仅无收款且没有未关闭支付或待复核收款的账单可作废。</p>
    <p v-else-if="operation === 'approve'">确认审批并向微信提交本笔全额退款？退款成功后无法撤回，申请人不能审批自己的申请。</p>
    <p v-else-if="operation === 'reject'">确认驳回这笔待审批退款？该操作不会向微信提交退款，并将释放本申请占用的可退额度。</p>
    <t-form v-else label-align="top">
      <t-form-item v-if="operation === 'receipt'" label="唯一收款凭证编号" required-mark><t-input v-model="reference" :maxlength="128" /></t-form-item>
      <t-form-item :label="operation === 'refund' ? '退款原因' : '实际收款时间、方式及凭证说明'" required-mark><t-textarea v-model="note" :maxlength="operation === 'refund' ? 80 : 500" /></t-form-item>
    </t-form>
    <p v-if="operation === 'refund'">申请后须由另一位有审批权限的管理员审批。受理后仍需等待渠道确认退款结果。</p>
  </t-dialog>
  </div>
</template>
<style scoped>
.commerce-filter { margin-bottom: 16px; }
.commerce-notice { margin-bottom: 16px; }
.commerce-pagination { display: flex; align-items: center; gap: 16px; margin-top: 16px; }
.commerce-pagination > span { flex-shrink: 0; }
.commerce-form, .commerce-section { margin-top: 16px; }
.commerce-form { max-height: calc(100dvh - 260px); overflow-y: auto; padding-inline: 2px; }
.commerce-agreement { white-space: pre-wrap; overflow-wrap: anywhere; }
.commerce-money { font-variant-numeric: tabular-nums; }
.commerce-qr { margin-top: 16px; text-align: center; }
</style>
