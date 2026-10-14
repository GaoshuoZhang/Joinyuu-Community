<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon } from 'tdesign-icons-vue-next'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import {
  createMessageTemplate,
  disableMessageTemplate,
  fetchMessageTemplateDetail,
  fetchMessageTemplates,
  previewMessageTemplate,
  publishMessageTemplate,
  saveMessageTemplateDraft,
  testSendMessageTemplate,
} from '@/api/messageTemplates'
import type {
  MessageChannelKind,
  MessageTemplate,
  MessageTemplateCategory,
  MessageTemplateDetail,
  MessageTemplateVersion,
} from '@/types'

/* 消息中心 · 模板配置（简化）：创建即发布；编辑「保存」即对当前发布版本生效；
 * 历史版本保留，重新发布历史版本即为回滚。 */
const loading = ref(true)
const loadError = ref('')
const templates = ref<MessageTemplate[]>([])

const KIND_LABEL: Record<string, string> = { sms: '短信', email: '邮件', inapp: '站内信' }
const CATEGORY_LABEL: Record<string, string> = { security: '安全类', marketing: '营销类' }

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

/* 提交互斥：避免重复点击产生并发创建 */
const submitting = ref(false)

async function onCreate() {
  if (submitting.value) return
  const valid = await createRef.value.validate()
  if (valid !== true) return focusFirstInvalid(createRef.value)
  submitting.value = true
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
    MessagePlugin.success('模板已创建并发布（v1）')
    await load()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '创建失败')
  } finally {
    submitting.value = false
  }
}

/* ---------- 详情 / 编辑 ---------- */
const detailVisible = ref(false)
const detailLoading = ref(false)
let detailRequest = 0
const detail = ref<MessageTemplateDetail | null>(null)
const editRef = ref()
const edit = reactive({
  name: '',
  category: 'security' as MessageTemplateCategory,
  variablesText: '',
  subject: '',
  body: '',
})

async function openDetail(row: MessageTemplate) {
  const request = ++detailRequest
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  try {
    const data = await fetchMessageTemplateDetail(row.id)
    if (request !== detailRequest || !detailVisible.value) return
    detail.value = data
    edit.name = data.name
    edit.category = data.category
    edit.variablesText = data.variables.join(', ')
    const latest = data.versions[0]
    edit.subject = latest?.subject ?? ''
    edit.body = latest?.body ?? ''
    closeDetailBaseline()
  } catch (error) {
    if (request !== detailRequest) return
    MessagePlugin.error(error instanceof Error ? error.message : '模板详情加载失败')
    detailVisible.value = false
  } finally {
    if (request === detailRequest) detailLoading.value = false
  }
}

async function reloadDetail() {
  if (!detail.value) return
  detail.value = await fetchMessageTemplateDetail(detail.value.id)
  const latest = detail.value.versions[0]
  edit.name = detail.value.name
  edit.category = detail.value.category
  edit.variablesText = detail.value.variables.join(', ')
  edit.subject = latest?.subject ?? ''
  edit.body = latest?.body ?? ''
  closeDetailBaseline()
}

/* 详情区动作互斥（保存并发布/回滚/下架共用）：避免连点重复发布版本 */
const detailActing = ref(false)

async function withAction(action: () => Promise<unknown>, successText: string) {
  if (detailActing.value) return
  detailActing.value = true
  try {
    await action()
    await reloadDetail()
    await load()
    MessagePlugin.success(successText)
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '操作失败')
  } finally {
    detailActing.value = false
  }
}

/** 保存并发布：编辑即生效（保存到当前发布版本） */
async function onSavePublish() {
  if (!detail.value) return
  const valid = await editRef.value.validate()
  if (valid !== true) return focusFirstInvalid(editRef.value)
  await withAction(
    () =>
      saveMessageTemplateDraft(detail.value!.id, {
        name: edit.name.trim(),
        category: edit.category,
        variables: parseVariables(edit.variablesText),
        subject: edit.subject.trim() || undefined,
        body: edit.body,
      }),
    '已保存并发布',
  )
}

/* ---------- 预览（Dialog 展示渲染后内容） ---------- */
const previewVisible = ref(false)
const previewLoading = ref(false)
const previewSubject = ref('')
const previewBody = ref('')

async function onPreview() {
  if (!detail.value || previewLoading.value) return
  previewLoading.value = true
  previewVisible.value = true
  try {
    const result = await previewMessageTemplate(detail.value.id, {
      variables: Object.fromEntries(detail.value.variables.map((v) => [v, `「${v}」`])),
    })
    previewSubject.value = result.subject ?? ''
    previewBody.value = result.body
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '预览失败')
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

/* ---------- 下架 / 回滚历史版本 ---------- */
function onPublish(version?: number) {
  guardDetailAction(() => { void publishVersion(version) }, '发布版本')
}

async function publishVersion(version?: number) {
  if (!detail.value) return
  await withAction(
    () => publishMessageTemplate(detail.value!.id, version),
    version ? `已回滚并发布 v${version}` : '模板已发布',
  )
}

function onDisable() {
  guardDetailAction(() => { void disableTemplate() }, '下架模板')
}

async function disableTemplate() {
  if (!detail.value) return
  await withAction(() => disableMessageTemplate(detail.value!.id), '模板已下架')
}

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

/* 测试发送互斥：真实渠道连点会重复投递 */
const testSending = ref(false)

async function onTestSend() {
  if (!testTemplate.value || testSending.value) return
  const valid = await testRef.value.validate()
  if (valid !== true) return focusFirstInvalid(testRef.value)
  testSending.value = true
  try {
    const result = await testSendMessageTemplate(testTemplate.value.id, {
      recipient: testForm.recipient.trim(),
      variables: parseJsonObject(testForm.variables),
    })
    testVisible.value = false
    const suffix = result.dryRun ? '（凭据未注入，已干跑）' : ''
    MessagePlugin.success(`测试发送成功${suffix} · 回执 ${result.providerMessageId ?? '—'} · ${result.costMs}ms`)
    if (result.warnings?.length) {
      MessagePlugin.warning(result.warnings.join('\n'))
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '测试发送失败')
  } finally {
    testSending.value = false
  }
}

function versionActionLabel(version: MessageTemplateVersion): string {
  return version.status === 'published' ? '' : '发布'
}
const { close: closeCreate } = useDialogFormProtection(createForm, createVisible, submitting)
const { close: closeDetail, markBaseline: closeDetailBaseline, guardClose: guardDetailAction } = useDialogFormProtection(edit, detailVisible, computed(() => detailActing.value || detailLoading.value))
const { close: closeTestDialog } = useDialogFormProtection(testForm, testVisible, testSending)
</script>

<template>
  <div class="template-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <!-- 操作按钮统一放筛选条右端（toolbar-right），与全站列表页（活动报名/数据字典）口径一致 -->
    <div class="page-filter-bar">
      <t-button theme="primary" class="toolbar-right" @click="openCreate">
        <template #icon><AddIcon /></template>
        新增模板
      </t-button>
    </div>

    <div class="page-card">
      <t-table row-key="id" :data="templates" :columns="columns" :loading="loading" table-layout="fixed" hover resizable>
        <template #kind="{ row }">
          <t-tag variant="light-outline" size="small">{{ KIND_LABEL[row.kind] || row.kind }}</t-tag>
        </template>
        <template #category="{ row }">
          <t-tag :theme="row.category === 'security' ? 'warning' : 'default'" variant="light" size="small">
            {{ CATEGORY_LABEL[row.category] || row.category }}
          </t-tag>
        </template>
        <template #status="{ row }">
          <StatusTag entity="messageTemplate" :value="row.status" />
          <span v-if="row.status === 'published'" class="muted version-tag">v{{ row.currentVersion }}</span>
        </template>
        <template #variables="{ row }">
          <span class="muted">{{ row.variables.join('、') || '—' }}</span>
        </template>
        <template #op="{ row }">
          <t-space size="small">
            <t-button variant="text" size="small" @click="openDetail(row)">编辑</t-button>
            <t-button variant="text" size="small" @click="openTest(row)">测试发送</t-button>
          </t-space>
        </template>

        <template #empty>
          <ListEmptyState description="暂无消息模板" />
        </template>
      </t-table>
    </div>

    <t-dialog
      :visible="createVisible"
      header="新增模板"
      width="640px"
      :footer="false"
     @close="closeCreate">
      <t-form ref="createRef" :data="createForm" label-align="top">
        <div class="form-grid">
          <t-form-item
            label="模板编码"
            name="code"
            :rules="[{ required: true, message: '请输入模板编码' }, { pattern: /^[a-z][a-z0-9_]{1,63}$/, message: '小写字母开头，仅含小写字母/数字/下划线' }]"
          >
            <t-input v-accessible-field v-model="createForm.code" clearable placeholder="如 verify_code…" />
          </t-form-item>
          <t-form-item label="模板名称" name="name" :rules="[{ required: true, message: '请输入模板名称' }]">
            <t-input v-accessible-field v-model="createForm.name" clearable placeholder="如 短信验证码…" />
          </t-form-item>
          <t-form-item label="消息类型" name="kind" :rules="[{ required: true, message: '请选择消息类型' }]">
            <t-select
              v-accessible-field
              v-model="createForm.kind"
              :options="[{ label: '短信', value: 'sms' }, { label: '邮件', value: 'email' }, { label: '站内信', value: 'inapp' }]"
            />
          </t-form-item>
          <t-form-item label="分类" name="category" :rules="[{ required: true, message: '请选择分类' }]">
            <t-select
              v-accessible-field
              v-model="createForm.category"
              :options="[{ label: '安全类（强制送达）', value: 'security' }, { label: '营销类（可退订/受安静时段约束）', value: 'marketing' }]"
            />
          </t-form-item>
        </div>
        <t-form-item label="变量白名单" name="variablesText" help="英文逗号分隔；正文中出现的 {{变量}} 必须在此白名单内">
          <t-input v-accessible-field v-model="createForm.variablesText" clearable placeholder="如 code, minutes…" />
        </t-form-item>
        <t-form-item label="邮件主题（仅邮件）" name="subject">
          <t-input v-accessible-field v-model="createForm.subject" clearable placeholder="留空则用模板编码…" />
        </t-form-item>
        <t-form-item label="模板正文" name="body" :rules="[{ required: true, message: '请输入模板正文' }]">
          <t-textarea v-accessible-field v-model="createForm.body" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="使用 {{变量}} 占位，如 验证码 {{code}}…" />
        </t-form-item>
      </t-form>
      <template #footer>
        <div class="dialog-footer">
          <t-button theme="default" @click="closeCreate">取消</t-button>
          <t-button theme="primary" :loading="submitting" @click="onCreate">创建并发布</t-button>
        </div>
      </template>
    </t-dialog>

    <t-dialog
      :visible="detailVisible"
      :header="detail ? `编辑模板 · ${detail.name}` : '编辑模板'"
      width="820px"
      :footer="false"
     @close="closeDetail">
      <t-loading :loading="detailLoading" size="small">
        <template v-if="detail">
          <t-form ref="editRef" :data="edit" label-align="top">
            <div class="form-grid">
              <t-form-item label="模板名称" name="name" :rules="[{ required: true, message: '请输入模板名称' }]">
                <t-input v-accessible-field v-model="edit.name" clearable />
              </t-form-item>
              <t-form-item label="分类" name="category">
                <t-select
                  v-accessible-field
                  v-model="edit.category"
                  :options="[{ label: '安全类', value: 'security' }, { label: '营销类', value: 'marketing' }]"
                />
              </t-form-item>
            </div>
            <t-form-item label="变量白名单" name="variablesText">
              <t-input v-accessible-field v-model="edit.variablesText" clearable placeholder="如 code, minutes…" />
            </t-form-item>
            <t-form-item label="邮件主题（仅邮件）" name="subject">
              <t-input v-accessible-field v-model="edit.subject" clearable />
            </t-form-item>
            <t-form-item label="模板正文" name="body" :rules="[{ required: true, message: '请输入模板正文' }]">
              <t-textarea v-accessible-field v-model="edit.body" :autosize="{ minRows: 3, maxRows: 8 }" />
            </t-form-item>
          </t-form>

          <!-- 编辑弹窗为表单级动作（保存并发布 / 预览 / 下架）并附带说明文案，footer 空间不足以承载，
               故此处保留 :footer="false" + 正文按钮区；创建与测试发送等确认型弹窗统一用 #footer 插槽 -->
          <t-space class="action-bar">
            <t-button theme="primary" :loading="detailActing" @click="onSavePublish">保存并发布</t-button>
            <t-button theme="default" @click="onPreview">预览</t-button>
            <!-- 下架立即中止发送，补二次确认 -->
            <t-popconfirm
              theme="danger"
              content="确认下架该模板？下架后停止发送，重新发布后恢复"
              @confirm="onDisable"
            >
              <t-button theme="danger" variant="outline" :disabled="detail.currentVersion === 0 || detailActing">下架</t-button>
            </t-popconfirm>
            <span class="muted action-hint">保存后立即可用于发送队列；如需恢复历史版本，在下表点「发布」回滚</span>
          </t-space>

          <div class="section-title">版本历史（发布历史版本即为回滚）</div>
          <t-table
            row-key="id"
            :data="detail.versions"
            :columns="[
              { colKey: 'version', title: '版本', width: 80 },
              { colKey: 'subject', title: '主题', width: 140 },
              { colKey: 'body', title: '正文', minWidth: 180 },
              { colKey: 'status', title: '状态', width: 100 },
              { colKey: 'createdAt', title: '创建时间', width: 170 },
              { colKey: 'op', title: '操作', width: 100, fixed: 'right' },
            ]"
            table-layout="fixed"
            hover
            resizable
          >
            <template #version="{ row }">v{{ row.version }}</template>
            <template #body="{ row }"><span class="muted body-preview" :title="row.body">{{ row.body }}</span></template>
            <template #status="{ row }">
              <StatusTag entity="messageTemplateVersion" :value="row.status" />
            </template>
            <template #op="{ row }">
              <!-- 发布历史版本即回滚，会覆盖当前发布版本，补二次确认 -->
              <t-popconfirm
                v-if="versionActionLabel(row)"
                content="确认发布该历史版本？将回滚并覆盖当前发布版本"
                @confirm="onPublish(row.version)"
              >
                <t-button variant="text" size="small">发布</t-button>
              </t-popconfirm>
            </template>

            <template #empty>
              <ListEmptyState description="暂无版本历史" />
            </template>
          </t-table>
        </template>
      </t-loading>
    </t-dialog>

    <t-dialog
      :visible="testVisible" @close="closeTestDialog"
      header="测试发送"
      width="560px"
      :footer="false"
    >
      <t-form ref="testRef" :data="testForm" label-align="top">
        <t-form-item label="收件人" name="recipient" :rules="[{ required: true, message: '请输入测试收件人' }]">
          <t-input v-accessible-field v-model="testForm.recipient" clearable :placeholder="testTemplate?.kind === 'email' ? '邮箱…' : testTemplate?.kind === 'inapp' ? '用户 UID…' : '手机号…'" />
        </t-form-item>
        <t-form-item label="模板变量（JSON）" name="variables">
          <t-input v-accessible-field v-model="testForm.variables" clearable placeholder='如 {"code":"1234","minutes":"5"}…' />
        </t-form-item>
      </t-form>
      <template #footer>
        <div class="dialog-footer">
          <t-button theme="default" @click="closeTestDialog">取消</t-button>
          <t-button theme="primary" :loading="testSending" @click="onTestSend">发送</t-button>
        </div>
      </template>
    </t-dialog>

    <t-dialog v-model:visible="previewVisible" header="模板预览" width="560px" :footer="false">
      <t-loading :loading="previewLoading" size="small">
        <div v-if="previewSubject" class="preview-subject">主题：{{ previewSubject }}</div>
        <div class="preview-body">{{ previewBody }}</div>
      </t-loading>
    </t-dialog>
  </div>
</template>

<style scoped>
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

@media (max-width: 640px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

.action-bar {
  margin: 4px 0 8px;
  flex-wrap: wrap;
}

.action-hint {
  align-self: center;
}

.muted {
  color: var(--td-text-color-secondary);
  font-size: 12px;
}

/* 主状态标签旁的版本号：与标签同一行并留出间距 */
.version-tag {
  margin-left: 6px;
}

.body-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.preview-subject {
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--td-text-color-primary);
}

/* 只读文本区域：限高可滚动，长正文不出弹窗 */
.preview-body {
  max-height: 360px;
  overflow-y: auto;
  padding: 12px;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-medium);
}
</style>
