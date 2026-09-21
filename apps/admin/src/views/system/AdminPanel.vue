<script setup lang="ts">
import { useListQueryState } from '@/utils/listQuery'
import ListErrorState from '@/components/ListErrorState.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
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
  { colKey: 'lastLoginAt', title: '最后登录', width: 160 , ellipsis: true},
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
      MessagePlugin.success({
        content: `管理员已新增，初始密码：${res.initialPassword}（请转告本人并尽快修改）`,
        duration: 8000,
      })
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

/* 重置密码 */
const resetVisible = ref(false)
const resetTarget = ref<AdminAccount | null>(null)
const resetPassword = ref('')
const resetting = ref(false)

function openReset(row: AdminAccount) {
  resetTarget.value = row
  resetPassword.value = ''
  resetVisible.value = true
}

async function onReset() {
  if (!resetTarget.value) return
  if (resetPassword.value.length < 8) {
    MessagePlugin.warning('新密码至少 8 位')
    return
  }
  resetting.value = true
  try {
    await resetAdminPassword(resetTarget.value.id, resetPassword.value)
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
  <div class="admin-panel page-fade-in">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />
    <PageHeader title="管理员账号" description="多运营人员账号、角色分配与启停管理" />

    <div class="page-filter-bar">
      <t-input v-model="keyword" class="filter-keyword" placeholder="搜索账号/姓名…" clearable @enter="onQuery" />
      <t-button theme="primary" variant="outline" @click="onQuery">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onResetQuery">
        重置
      </t-button>
      <t-button theme="primary" class="filter-create" @click="openCreate">
        <template #icon><AddIcon /></template>
        新增管理员
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="filtered"
        :columns="columns"
        :loading="loading"
        empty="暂无管理员账号"
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
          <t-tag :theme="row.status === 'active' ? 'success' : 'default'" variant="light">
            {{ row.status === 'active' ? '正常' : '已停用' }}
          </t-tag>
        </template>
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
      </t-table>
    </div>

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
          <t-button theme="primary" :loading="resetting" @click="onReset">确认重置</t-button>
        </div>
      </template>
      <p class="reset-tip">将重置「{{ resetTarget?.username }}」的登录密码，重置后需使用新密码登录。</p>
      <t-input v-model="resetPassword" type="password" name="reset-password" autocomplete="new-password" placeholder="新密码（至少 8 位）…" />
    </t-dialog>
  </div>
</template>

<style scoped>
.filter-keyword {
  width: 240px;
}
.filter-create {
  margin-left: auto;
}

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

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.reset-tip {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}
</style>
