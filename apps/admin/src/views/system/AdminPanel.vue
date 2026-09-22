<script setup lang="ts">
import { useListQueryState } from '@/utils/listQuery'
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import StatusTag from '@/components/StatusTag.vue'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { CustomValidateResolveType, FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import { AddIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchAdmins, saveAdmin, updateAdminStatus, resetAdminPassword, type AdminAccount } from '@/api/admins'
import { fetchRoles } from '@/api/roles'

/* 管理员账号：多运营人员 + 角色分配 + 启停 + 重置密码 */

const loading = ref(true)
const loadError = ref('')
const list = ref<AdminAccount[]>([])
const roleOptions = ref<{ label: string; value: string }[]>([])

const keyword = ref('')
const appliedKeyword = ref('')

const columns = [
  { colKey: 'account', title: '账号', cell: 'account', width: 180 , ellipsis: true},
  { colKey: 'roles', title: '角色', cell: 'roles', width: 200 , ellipsis: true},
  { colKey: 'status', title: '状态', cell: 'status', width: 90 , ellipsis: true},
  { colKey: 'lastLoginAt', title: '最后登录', cell: 'lastLoginAt', width: 160 , ellipsis: true},
  { colKey: 'createdAt', title: '创建时间', width: 160 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 220 },
]

async function load() {
  loading.value = true
  try {
    const [accounts, roles] = await Promise.all([fetchAdmins(), fetchRoles()])
    list.value = accounts
    roleOptions.value = roles.map((r) => ({ label: r.name, value: r.code }))
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

function roleLabels(roles: string[]): string {
  const map = Object.fromEntries(roleOptions.value.map((r) => [r.value, r.label]))
  return roles.map((c) => map[c] ?? c).join('、') || '—'
}

/* 新增 / 编辑 */
const formVisible = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()
const saving = ref(false)
const form = reactive({ username: '', name: '', roleCodes: [] as string[] })

const rules: FormProps['rules'] = {
  username: [{ required: true, message: '请输入账号', trigger: 'submit' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'submit' }],
  roleCodes: [{ required: true, message: '请选择角色', trigger: 'submit' }],
}

function openCreate() {
  editingId.value = null
  form.username = ''
  form.name = ''
  form.roleCodes = []
  formVisible.value = true
}

function openEdit(row: AdminAccount) {
  editingId.value = row.id
  form.username = row.username
  form.name = row.name
  form.roleCodes = [...row.roleCodes]
  formVisible.value = true
}

async function onSave() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  saving.value = true
  try {
    const res = await saveAdmin(editingId.value, { ...form })
    if (editingId.value == null && res.initialPassword) {
      /* 初始密码仅此一次返回，改用常驻弹窗（可复制）承接，避免 8 秒 toast 错过即丢 */
      createdAccount.username = form.username
      createdAccount.password = res.initialPassword
      passwordVisible.value = true
      MessagePlugin.success('管理员已新增')
    } else {
      MessagePlugin.success(editingId.value == null ? '管理员已新增' : '修改已保存')
    }
    formVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

/* 初始密码展示：常驻弹窗 + 复制，需显式确认关闭（密码只返回一次） */
const passwordVisible = ref(false)
const createdAccount = reactive({ username: '', password: '' })

/** 复制文本：优先 Clipboard API，非安全上下文（局域网 IP）回退 execCommand */
async function copyPassword() {
  const text = createdAccount.password
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      MessagePlugin.success('初始密码已复制到剪贴板')
      return
    }
  } catch {
    /* 权限拒绝/非安全上下文 → 走回退 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    if (ok) MessagePlugin.success('初始密码已复制到剪贴板')
    else MessagePlugin.error('复制失败，请手动复制')
  } catch {
    MessagePlugin.error('复制失败，请手动复制')
  }
}

/* 启停：行级 loading/禁用防止重复点击，失败保留列表原状并提示 */
const togglingId = ref<number | null>(null)

async function onToggleStatus(row: AdminAccount) {
  if (togglingId.value != null) return
  const next = row.status === 'active' ? 'disabled' : 'active'
  togglingId.value = row.id
  try {
    await updateAdminStatus(row.id, next)
    MessagePlugin.success(next === 'disabled' ? '已停用该账号' : '已启用该账号')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    togglingId.value = null
  }
}

/* 重置密码：规则对齐后端 ResetPasswordDto（≥8 位且含字母与数字）+ 同域二次输入约定 */
const resetVisible = ref(false)
const resetTarget = ref<AdminAccount | null>(null)
const resetFormRef = ref()
const resetForm = reactive({ password: '', confirmPassword: '' })
const resetting = ref(false)

/* TDesign 自定义校验器第二参只带 { formData, name }，字段值须从 formData 读取 */
function validateConfirmPassword(
  _value: unknown,
  params?: { formData: Record<string, unknown>; name: string },
): CustomValidateResolveType {
  if (params?.formData?.confirmPassword !== params?.formData?.password) {
    return { result: false, message: '两次输入的密码不一致' }
  }
  return true
}

const resetRules: FormProps['rules'] = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'submit' },
    { min: 8, message: '新密码至少 8 位', trigger: 'submit' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '新密码需同时包含字母和数字', trigger: 'submit' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'submit' },
    { validator: validateConfirmPassword, trigger: 'submit' },
  ],
}

function openReset(row: AdminAccount) {
  resetTarget.value = row
  resetForm.password = ''
  resetForm.confirmPassword = ''
  resetVisible.value = true
  nextTick(() => resetFormRef.value?.clearValidate())
}

async function onReset() {
  if (!resetTarget.value) return
  const valid = await resetFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(resetFormRef.value)
  resetting.value = true
  try {
    await resetAdminPassword(resetTarget.value.id, resetForm.password)
    MessagePlugin.success(`已重置「${resetTarget.value.username}」的密码`)
    resetVisible.value = false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '重置失败')
  } finally {
    resetting.value = false
  }
}

const filtered = computed(() => {
  const kw = appliedKeyword.value.toLowerCase()
  if (!kw) return list.value
  return list.value.filter((a) => a.username.toLowerCase().includes(kw) || a.name.toLowerCase().includes(kw))
})

/* 空态筛选判定 */
const filterState = computed(() => ({ keyword: appliedKeyword.value }))

function onQuery() {
  appliedKeyword.value = keyword.value.trim()
  syncQuery()
}

function onResetQuery() {
  keyword.value = ''
  appliedKeyword.value = ''
  syncQuery()
}

const { syncQuery } = useListQueryState({}, () => { keyword.value = appliedKeyword.value }, { prefix: 'admins.', refs: { keyword: appliedKeyword } })
keyword.value = appliedKeyword.value

onMounted(load)
</script>

<template>
  <div class="admin-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="管理员账号" description="多运营人员账号、角色分配与启停管理" />

    <div class="page-filter-bar">
      <t-input v-model="keyword" class="ctl-w-xl" placeholder="搜索账号/姓名…" clearable @enter="onQuery" />
      <t-button theme="primary" variant="outline" @click="onQuery">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onResetQuery">
        重置
      </t-button>
      <t-button theme="primary" class="toolbar-right" @click="openCreate">
        <template #icon><AddIcon /></template>
        新增管理员
      </t-button>
    </div>

    <!-- 卡片由聚合壳（AccountRoleView）提供，面板内不再嵌套 page-card -->
    <t-table
      row-key="id"
      table-layout="fixed"
      hover
      resizable
      :data="filtered"
      :columns="columns"
      :loading="loading"
    >
      <template #account="{ row }">
        <div class="account-cell">
          <span class="account-name">{{ row.username }}</span>
          <span class="account-sub">{{ row.name }}</span>
        </div>
      </template>
      <template #roles="{ row }">
        <div class="role-wrap">
          <t-tag v-for="r in row.roleCodes" :key="r" variant="light" size="small">{{ roleLabels([r]) }}</t-tag>
        </div>
      </template>
      <template #status="{ row }">
        <StatusTag entity="admin" :value="row.status" />
      </template>
      <template #lastLoginAt="{ row }">{{ row.lastLoginAt || '—' }}</template>
      <template #op="{ row }">
        <div class="op-cell" @click.stop>
          <t-button variant="text" size="small" @click="openEdit(row)">编辑</t-button>
          <t-button variant="text" size="small" @click="openReset(row)">重置密码</t-button>
          <t-popconfirm
            :content="row.status === 'active' ? '确认停用该账号？' : '确认启用该账号？'"
            @confirm="onToggleStatus(row)"
          >
            <t-button variant="text" size="small" :theme="row.status === 'active' ? 'danger' : 'primary'"
              :loading="togglingId === row.id"
              :disabled="togglingId != null"
            >
              {{ row.status === 'active' ? '停用' : '启用' }}
            </t-button>
          </t-popconfirm>
        </div>
      </template>

      <template #empty>
        <ListEmptyState :query="filterState" description="暂无管理员账号" @clear="onResetQuery" />
      </template>
    </t-table>

    <!-- 新增 / 编辑弹窗 -->
    <t-dialog
      v-model:visible="formVisible"
      :header="editingId == null ? '新增管理员' : '编辑管理员'"
      width="520px"
      @close="formVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="formVisible = false">取消</t-button>
          <t-button theme="primary" :loading="saving" @click="onSave">保存</t-button>
        </div>
      </template>
      <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
        <t-form-item label="账号" name="username">
          <t-input v-model="form.username" :disabled="editingId != null" name="username" autocomplete="off" :spellcheck="false" placeholder="登录用户名（唯一）…" />
        </t-form-item>
        <t-form-item label="姓名" name="name">
          <t-input v-model="form.name" name="display-name" autocomplete="off" placeholder="操作日志中的操作人显示名…" />
        </t-form-item>
        <t-form-item label="角色" name="roleCodes">
          <t-select v-model="form.roleCodes" multiple :options="roleOptions" placeholder="选择角色（可多选）…" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 重置密码 -->
    <t-dialog
      v-model:visible="resetVisible"
      header="重置密码"
      width="440px"
      @close="resetVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="resetVisible = false">取消</t-button>
          <t-button theme="danger" :loading="resetting" @click="onReset">确认重置</t-button>
        </div>
      </template>
      <p class="reset-tip">将重置「{{ resetTarget?.username }}」的登录密码，重置后需使用新密码登录。</p>
      <t-form ref="resetFormRef" :data="resetForm" :rules="resetRules" label-align="top">
        <t-form-item label="新密码" name="password">
          <t-input v-model="resetForm.password" type="password" name="reset-password" autocomplete="new-password" placeholder="至少 8 位，须含字母和数字…" />
        </t-form-item>
        <t-form-item label="确认新密码" name="confirmPassword">
          <t-input v-model="resetForm.confirmPassword" type="password" name="reset-password-confirm" autocomplete="new-password" placeholder="再次输入新密码…" />
        </t-form-item>
      </t-form>
    </t-dialog>

    <!-- 初始密码：仅返回一次，常驻展示直至显式确认 -->
    <t-dialog
      v-model:visible="passwordVisible"
      header="管理员已新增"
      width="480px"
      :close-btn="false"
      :close-on-overlay-click="false"
      :close-on-esc-keydown="false"
    >
      <p class="reset-tip">
        账号「{{ createdAccount.username }}」的初始密码仅显示这一次，请立即复制并转告本人，登录后尽快修改。
      </p>
      <div class="password-row">
        <t-input :value="createdAccount.password" readonly aria-label="初始密码" />
        <t-button theme="primary" variant="outline" @click="copyPassword">复制</t-button>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <t-button theme="primary" @click="passwordVisible = false">我已妥善保存</t-button>
        </div>
      </template>
    </t-dialog>
  </div>
</template>

<style scoped>
.account-cell {
  display: flex;
  flex-direction: column;
}

.account-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.account-sub {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.role-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.reset-tip {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}

.password-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
