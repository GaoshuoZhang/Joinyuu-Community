<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import {
  createMessageTemplate,
  disableMessageTemplate,
  fetchMessageTemplateDetail,
  fetchMessageTemplates,
  previewMessageTemplate,
  publishMessageTemplate,
  reviewMessageTemplate,
  saveMessageTemplateDraft,
  submitMessageTemplate,
  testSendMessageTemplate,
} from '@/api/messageTemplates'
import type {
  MessageChannelKind,
  MessageTemplate,
  MessageTemplateCategory,
  MessageTemplateDetail,
  MessageTemplateVersion,
} from '@/types'

/* 消息中心 · 模板中心（P0）：变量白名单 + 版本化 + 审批 + 测试发送 + 回滚。
 * 发布需先经审核通过；重新发布历史版本即为回滚。 */
const loading = ref(true)
const loadError = ref('')
const templates = ref<MessageTemplate[]>([])

const KIND_LABEL: Record<string, string> = { sms: '短信', email: '邮件', inapp: '站内信' }
const CATEGORY_LABEL: Record<string, string> = { security: '安全类', marketing: '营销类' }
const VERSION_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  published: '已发布',
  archived: '历史版本',
}
const VERSION_STATUS_THEME: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
  draft: 'default',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  published: 'primary',
  archived: 'default',
}

async function load() {
  loading.value = true
  try {
    templates.value = await fetchMessageTemplates()
    loadError.value = ''
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '模板列表加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const columns = [
  { colKey: 'name', title: '模板', width: 220 },
  { colKey: 'code', title: '编码', width: 180 },
  { colKey: 'kind', title: '类型', width: 90 },
  { colKey: 'category', title: '分类', width: 100 },
  { colKey: 'status', title: '状态', width: 110 },
  { colKey: 'variables', title: '变量', width: 180 },
  { colKey: 'updatedAt', title: '最近保存', width: 170 },
  { colKey: 'op', title: '操作', width: 150, fixed: 'right' as const },
]

/* ---------- 新建 ---------- */
const createVisible = ref(false)
const createRef = ref()
const createForm = reactive({
  code: '',
  name: '',
  kind: 'sms' as MessageChannelKind,
  category: 'security' as MessageTemplateCategory,
  variablesText: '',
  subject: '',
  body: '',
})

function openCreate() {
  createForm.code = ''
  createForm.name = ''
  createForm.kind = 'sms'
  createForm.category = 'security'
  createForm.variablesText = ''
  createForm.subject = ''
  createForm.body = ''
  createVisible.value = true
  void createRef.value?.clearValidate?.()
}

function parseVariables(text: string): string[] {
  return [...new Set(text.split(/[,，\s]+/).map((v) => v.trim()).filter(Boolean))]
}

async function onCreate() {
  const valid = await createRef.value.validate()
  if (valid !== true) return
  try {
    await createMessageTemplate({
      code: createForm.code.trim(),
      name: createForm.name.trim(),
      kind: createForm.kind,
      category: createForm.category,
      variables: parseVariables(createForm.variablesText),
      subject: createForm.subject.trim() || undefined,
      body: createForm.body,
    })
    createVisible.value = false
    MessagePlugin.success('模板已创建（草稿版本 v1）')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '创建失败')
  }
}

/* ---------- 详情 / 编辑 ---------- */
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<MessageTemplateDetail | null>(null)
const editRef = ref()
const edit = reactive({
  name: '',
  category: 'security' as MessageTemplateCategory,
  variablesText: '',
  subject: '',
  body: '',
  reviewNote: '',
})

async function openDetail(row: MessageTemplate) {
  detailVisible.value = true
  detailLoading.value = true
  try {
    const data = await fetchMessageTemplateDetail(row.id)
    detail.value = data
    edit.name = data.name
    edit.category = data.category
    edit.variablesText = data.variables.join(', ')
    const latest = data.versions[0]
    edit.subject = latest?.subject ?? ''
    edit.body = latest?.body ?? ''
    edit.reviewNote = ''
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '模板详情加载失败')
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

async function reloadDetail() {
  if (!detail.value) return
  detail.value = await fetchMessageTemplateDetail(detail.value.id)
  const latest = detail.value.versions[0]
  edit.subject = latest?.subject ?? ''
  edit.body = latest?.body ?? ''
}

async function withAction(action: () => Promise<unknown>, successText: string) {
  try {
    await action()
    await reloadDetail()
    await load()
    MessagePlugin.success(successText)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '操作失败')
  }
}

async function onSaveDraft() {
  if (!detail.value) return
  const valid = await editRef.value.validate()
  if (valid !== true) return
  await withAction(
    () =>
      saveMessageTemplateDraft(detail.value!.id, {
        name: edit.name.trim(),
        category: edit.category,
        variables: parseVariables(edit.variablesText),
        subject: edit.subject.trim() || undefined,
        body: edit.body,
      }),
    '草稿已保存',
  )
}

async function onPreview() {
  if (!detail.value) return
  try {
    const result = await previewMessageTemplate(detail.value.id, {
      variables: Object.fromEntries(detail.value.variables.map((v) => [v, `「${v}」`])),
    })
    MessagePlugin.info(`预览：${result.subject ? `${result.subject} / ` : ''}${result.body}`)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '预览失败')
  }
}

const latestVersion = computed(() => detail.value?.versions[0] ?? null)
const canPublishLatest = computed(() =>
  ['approved', 'archived'].includes(latestVersion.value?.status ?? ''),
)

/* ---------- 审核 / 发布 / 下架 ---------- */
async function onReview(approve: boolean) {
  if (!detail.value) return
  if (!approve && !edit.reviewNote.trim()) {
    MessagePlugin.warning('驳回时必须填写原因')
    return
  }
  await withAction(
    () => reviewMessageTemplate(detail.value!.id, { approve, note: edit.reviewNote.trim() || undefined }),
    approve ? '审核已通过' : '已驳回',
  )
}

async function onPublish(version?: number) {
  if (!detail.value) return
  await withAction(
    () => publishMessageTemplate(detail.value!.id, version),
    version ? `已回滚并发布 v${version}` : '模板已发布',
  )
}

async function onDisable() {
  if (!detail.value) return
  await withAction(() => disableMessageTemplate(detail.value!.id), '模板已下架')
}

const pendingVersion = computed(() =>
  detail.value?.versions.find((v) => v.status === 'pending') ?? null,
)

/* ---------- 测试发送 ---------- */
const testVisible = ref(false)
const testRef = ref()
const testTemplate = ref<MessageTemplate | null>(null)
const testForm = reactive({ recipient: '', variables: '{}' })

function openTest(row: MessageTemplate) {
  testTemplate.value = row
  testForm.recipient = ''
  testForm.variables = JSON.stringify(Object.fromEntries(row.variables.map((v) => [v, `示例${v}`])), null, 0)
  testVisible.value = true
  void testRef.value?.clearValidate?.()
}

function parseJsonObject(text: string): Record<string, string> {
  const raw = text.trim()
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('模板变量须为 JSON 对象')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('模板变量须为 JSON 对象')
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    out[key] = value == null ? '' : String(value)
  }
  return out
}

async function onTestSend() {
  if (!testTemplate.value) return
  const valid = await testRef.value.validate()
  if (valid !== true) return
  try {
    const result = await testSendMessageTemplate(testTemplate.value.id, {
      recipient: testForm.recipient.trim(),
      variables: parseJsonObject(testForm.variables),
    })
    testVisible.value = false
    const suffix = result.dryRun ? '（凭据未注入，已干跑）' : ''
    MessagePlugin.success(`测试发送成功${suffix} · 回执 ${result.providerMessageId ?? '—'} · ${result.costMs}ms`)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '测试发送失败')
  }
}

function versionActionLabel(version: MessageTemplateVersion): string {
  return version.status === 'published' ? '' : '发布'
}
</script>

<template>
  <div class="template-panel page-fade-in">
    <PageHeader title="模板中心" description="变量白名单 / 版本化 / 审批 / 测试发送；发布后方可用于发送队列">
      <template #actions>
        <t-button theme="primary" @click="openCreate">新增模板</t-button>
      </template>
    </PageHeader>

    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <t-card :bordered="true" class="template-card">
      <t-table row-key="id" :data="templates" :columns="columns" :loading="loading" table-layout="fixed" hover>
        <template #name="{ row }"><span>{{ row.name }}</span></template>
        <template #kind="{ row }">
          <t-tag variant="light-outline" size="small">{{ KIND_LABEL[row.kind] || row.kind }}</t-tag>
        </template>
        <template #category="{ row }">
          <t-tag :theme="row.category === 'security' ? 'warning' : 'default'" variant="light" size="small">
            {{ CATEGORY_LABEL[row.category] || row.category }}
          </t-tag>
        </template>
        <template #status="{ row }">
          <t-tag :theme="row.status === 'published' ? 'success' : 'default'" variant="light" size="small">
            {{ row.status === 'published' ? `已发布 v${row.currentVersion}` : '草稿' }}
          </t-tag>
        </template>
        <template #variables="{ row }">
          <span class="muted">{{ row.variables.join('、') || '—' }}</span>
        </template>
        <template #op="{ row }">
          <t-space size="small">
            <t-link theme="primary" hover="color" @click="openDetail(row)">编辑</t-link>
            <t-link theme="primary" hover="color" @click="openTest(row)">测试发送</t-link>
          </t-space>
        </template>
      </t-table>
    </t-card>

    <t-dialog
      v-model:visible="createVisible"
      header="新增模板"
      width="640px"
      :confirm-btn="{ content: '创建', theme: 'primary' }"
      @confirm="onCreate"
    >
      <t-form ref="createRef" :data="createForm" label-align="top">
        <div class="form-grid">
          <t-form-item
            label="模板编码"
            name="code"
            :rules="[{ required: true, message: '请输入模板编码' }, { pattern: /^[a-z][a-z0-9_]{1,63}$/, message: '小写字母开头，仅含小写字母/数字/下划线' }]"
          >
            <t-input v-model="createForm.code" clearable placeholder="如 verify_code…" />
          </t-form-item>
          <t-form-item label="模板名称" name="name" :rules="[{ required: true, message: '请输入模板名称' }]">
            <t-input v-model="createForm.name" clearable placeholder="如 短信验证码…" />
          </t-form-item>
          <t-form-item label="消息类型" name="kind" :rules="[{ required: true, message: '请选择消息类型' }]">
            <t-select
              v-model="createForm.kind"
              :options="[{ label: '短信', value: 'sms' }, { label: '邮件', value: 'email' }, { label: '站内信', value: 'inapp' }]"
            />
          </t-form-item>
          <t-form-item label="分类" name="category" :rules="[{ required: true, message: '请选择分类' }]">
            <t-select
              v-model="createForm.category"
              :options="[{ label: '安全类（强制送达）', value: 'security' }, { label: '营销类（可退订/受安静时段约束）', value: 'marketing' }]"
            />
          </t-form-item>
        </div>
        <t-form-item label="变量白名单" name="variablesText" help="英文逗号分隔；正文中出现的 {{变量}} 必须在此白名单内">
          <t-input v-model="createForm.variablesText" clearable placeholder="如 code, minutes…" />
        </t-form-item>
        <t-form-item label="邮件主题（仅邮件）" name="subject">
          <t-input v-model="createForm.subject" clearable placeholder="留空则用模板编码…" />
        </t-form-item>
        <t-form-item label="模板正文" name="body" :rules="[{ required: true, message: '请输入模板正文' }]">
          <t-textarea v-model="createForm.body" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="使用 {{变量}} 占位，如 验证码 {{code}}…" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <t-dialog
      v-model:visible="detailVisible"
      :header="detail ? `编辑模板 · ${detail.name}` : '编辑模板'"
      width="820px"
      :footer="false"
    >
      <t-loading :loading="detailLoading" size="small">
        <template v-if="detail">
          <t-form ref="editRef" :data="edit" label-align="top">
            <div class="form-grid">
              <t-form-item label="模板名称" name="name" :rules="[{ required: true, message: '请输入模板名称' }]">
                <t-input v-model="edit.name" clearable />
              </t-form-item>
              <t-form-item label="分类" name="category">
                <t-select
                  v-model="edit.category"
                  :options="[{ label: '安全类', value: 'security' }, { label: '营销类', value: 'marketing' }]"
                />
              </t-form-item>
            </div>
            <t-form-item label="变量白名单" name="variablesText">
              <t-input v-model="edit.variablesText" clearable placeholder="如 code, minutes…" />
            </t-form-item>
            <t-form-item label="邮件主题（仅邮件）" name="subject">
              <t-input v-model="edit.subject" clearable />
            </t-form-item>
            <t-form-item label="模板正文" name="body" :rules="[{ required: true, message: '请输入模板正文' }]">
              <t-textarea v-model="edit.body" :autosize="{ minRows: 3, maxRows: 8 }" />
            </t-form-item>
            <t-form-item label="审核意见（驳回必填）" name="reviewNote">
              <t-input v-model="edit.reviewNote" clearable placeholder="选填…" />
            </t-form-item>
          </t-form>

          <t-space class="action-bar">
            <t-button theme="default" @click="onSaveDraft">保存草稿</t-button>
            <t-button theme="default" @click="onPreview">预览</t-button>
            <t-button theme="default" :disabled="!latestVersion || latestVersion.status !== 'draft'" @click="withAction(() => submitMessageTemplate(detail!.id), '已提交审核')">提交审核</t-button>
            <t-button theme="success" :disabled="!pendingVersion" @click="onReview(true)">审核通过</t-button>
            <t-button theme="danger" variant="outline" :disabled="!pendingVersion" @click="onReview(false)">驳回</t-button>
            <t-button theme="primary" :disabled="!canPublishLatest" @click="onPublish()">
              {{ detail.currentVersion > 0 ? '重新发布最新版本' : '发布' }}
            </t-button>
            <t-button theme="default" :disabled="detail.currentVersion === 0" @click="onDisable">下架</t-button>
          </t-space>

          <div class="section-title">版本历史（发布历史版本即为回滚）</div>
          <t-table
            row-key="id"
            :data="detail.versions"
            :columns="[
              { colKey: 'version', title: '版本', width: 90 },
              { colKey: 'subject', title: '主题', width: 160 },
              { colKey: 'body', title: '正文' },
              { colKey: 'status', title: '状态', width: 110 },
              { colKey: 'createdAt', title: '创建时间', width: 160 },
              { colKey: 'op', title: '操作', width: 110 },
            ]"
            table-layout="fixed"
            hover
          >
            <template #version="{ row }">v{{ row.version }}</template>
            <template #body="{ row }"><span class="muted body-preview">{{ row.body }}</span></template>
            <template #status="{ row }">
              <t-tag :theme="VERSION_STATUS_THEME[row.status] || 'default'" variant="light" size="small">
                {{ VERSION_STATUS_LABEL[row.status] || row.status }}
              </t-tag>
            </template>
            <template #op="{ row }">
              <t-link v-if="versionActionLabel(row)" theme="primary" hover="color" @click="onPublish(row.version)">发布</t-link>
            </template>
          </t-table>
        </template>
      </t-loading>
    </t-dialog>

    <t-dialog
      v-model:visible="testVisible"
      header="测试发送"
      width="560px"
      :confirm-btn="{ content: '发送', theme: 'primary' }"
      @confirm="onTestSend"
    >
      <t-form ref="testRef" :data="testForm" label-align="top">
        <t-form-item label="收件人" name="recipient" :rules="[{ required: true, message: '请输入测试收件人' }]">
          <t-input v-model="testForm.recipient" clearable :placeholder="testTemplate?.kind === 'email' ? '邮箱…' : testTemplate?.kind === 'inapp' ? '用户 UID…' : '手机号…'" />
        </t-form-item>
        <t-form-item label="模板变量（JSON）" name="variables">
          <t-input v-model="testForm.variables" clearable placeholder='如 {"code":"1234","minutes":"5"}…' />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.template-card {
  width: 100%;
}

.section-title {
  margin: 16px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}

.action-bar {
  margin: 4px 0 8px;
  flex-wrap: wrap;
}

.muted {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

.body-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
