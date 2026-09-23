<script setup lang="ts">
import ListErrorState from '@/components/ListErrorState.vue'
import ListEmptyState from '@/components/ListEmptyState.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { AddIcon, SearchIcon } from 'tdesign-icons-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import {
  createRole,
  fetchPermissionCatalog,
  fetchRoles,
  saveRoleAssignment,
  type AdminRole,
} from '@/api/roles'
import { permissionGroups as builtinPermissionGroups } from '@/constants/permissions'
import { scopeOptions, scopeLabel } from '@/constants/scopes'

/* 角色权限：角色列表 + 权限点分配矩阵（按权限目录分组渲染）+ 新增自定义角色 */

const loading = ref(true)
const loadError = ref('')
const roles = ref<AdminRole[]>([])
const saving = ref(false)

const keyword = ref('')
const appliedKeyword = ref('')

const filtered = computed(() => {
  const kw = appliedKeyword.value.toLowerCase()
  if (!kw) return roles.value
  return roles.value.filter(
    (r) =>
      r.name.toLowerCase().includes(kw) ||
      r.code.toLowerCase().includes(kw) ||
      r.description.toLowerCase().includes(kw),
  )
})

function onQuery() {
  appliedKeyword.value = keyword.value.trim()
}

function onResetQuery() {
  keyword.value = ''
  appliedKeyword.value = ''
}

/* 新增角色 */
const createVisible = ref(false)
const createFormRef = ref()
const creating = ref(false)
const createForm = reactive({ code: '', name: '', description: '' })

const createRules: FormProps['rules'] = {
  code: [
    { required: true, message: '请输入角色编码', trigger: 'submit' },
    { pattern: /^[a-z][a-z0-9_]{1,31}$/, message: '小写字母开头，仅含小写字母/数字/下划线，长度 2-32', trigger: 'submit' },
  ],
  name: [{ required: true, message: '请输入角色名称', trigger: 'submit' }],
}

function openCreate() {
  createForm.code = ''
  createForm.name = ''
  createForm.description = ''
  createVisible.value = true
}

async function onCreate() {
  const valid = await createFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(createFormRef.value)
  creating.value = true
  try {
    await createRole({ ...createForm })
    MessagePlugin.success('角色已新增，初始无权限点，可通过「权限配置」分配')
    createVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '新增失败')
  } finally {
    creating.value = false
  }
}

const assignVisible = ref(false)
const current = ref<AdminRole | null>(null)
const checked = ref<string[]>([])
const scopeDraft = ref<string[]>([])
/* 打开弹窗时的快照：用于判断是否有未保存改动，避免重复提交 */
const originalChecked = ref<string[]>([])
const originalScope = ref<string[]>([])

/* 权限分组目录：优先使用后端目录（新增权限点自动出现），失败回退内置副本 */
type PermGroup = { name: string; perms: { code: string; name: string }[] }
const groups = ref<PermGroup[]>(builtinPermissionGroups as PermGroup[])

function allCodes(): string[] {
  return groups.value.flatMap((g) => g.perms.map((p) => p.code))
}

async function loadCatalog() {
  try {
    const catalog = await fetchPermissionCatalog()
    if (catalog.length) {
      groups.value = catalog.map((g) => ({
        name: g.name,
        perms: g.perms.map((p) => ({ code: p.code, name: p.name })),
      }))
    }
  } catch {
    /* 目录加载失败保留内置副本 */
  }
}

const columns = [
  { colKey: 'name', title: '角色', cell: 'name', width: 160 , ellipsis: true},
  { colKey: 'code', title: '编码', width: 140 , ellipsis: true},
  { colKey: 'description', title: '说明', width: 200 , ellipsis: true},
  { colKey: 'permCount', title: '权限数', cell: 'permCount', width: 90 , ellipsis: true},
  /* 数据范围最多 7 个域标签：加宽并交由单元格自行换行，避免 ellipsis 截断后丢失信息 */
  { colKey: 'dataScope', title: '数据范围', cell: 'dataScope', width: 280 },
  { colKey: 'op', title: '操作', cell: 'op', width: 120 },
]

async function load() {
  loading.value = true
  try {
    roles.value = await fetchRoles()
    loadError.value = ''
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

function permCount(role: AdminRole): string {
  return role.permCodes.includes('*') ? '全部' : String(role.permCodes.length)
}

function openAssign(role: AdminRole) {
  current.value = role
  checked.value = role.permCodes.includes('*') ? allCodes() : [...role.permCodes]
  scopeDraft.value = [...(role.dataScope ?? [])]
  originalChecked.value = [...checked.value]
  originalScope.value = [...scopeDraft.value]
  assignVisible.value = true
}

function toggleGroup(groupPerms: { code: string }[], on: boolean) {
  const codes = groupPerms.map((p) => p.code)
  if (on) {
    checked.value = [...new Set([...checked.value, ...codes])]
  } else {
    checked.value = checked.value.filter((c) => !codes.includes(c))
  }
}

const groupChecked = (groupPerms: { code: string }[]) =>
  groupPerms.every((p) => checked.value.includes(p.code))

/* 分组半选态：组内既有已选也有未选时，父级复选框呈半选，避免「全选/全不选」二义 */
const groupIndeterminate = (groupPerms: { code: string }[]) => {
  const count = groupPerms.filter((p) => checked.value.includes(p.code)).length
  return count > 0 && count < groupPerms.length
}

const sameSet = (a: string[], b: string[]) => [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

/* 超管保存恒传 ['*']，权限矩阵不可编辑，因此仅在普通角色下判断改动 */
const dirty = computed(
  () =>
    !!current.value &&
    !isSuper.value &&
    (!sameSet(checked.value, originalChecked.value) || !sameSet(scopeDraft.value, originalScope.value)),
)

async function onSave() {
  if (!current.value) return
  saving.value = true
  try {
    /* 超管角色后端强制全量（*）：保存恒传 ['*']，避免显式集合固化丢失后续新增权限点 */
    const codes = isSuper.value ? ['*'] : checked.value
    /* 权限 + 数据范围合并为单事务保存：避免两步串行请求部分失败留下 RBAC 中间态 */
    await saveRoleAssignment(current.value.id, codes, isSuper.value ? [] : scopeDraft.value)
    await load()
    MessagePlugin.success('角色权限已保存')
    assignVisible.value = false
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

const isSuper = computed(() => current.value?.permCodes.includes('*') ?? false)

onMounted(() => {
  void load()
  void loadCatalog()
})
</script>

<template>
  <div class="role-panel">
    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="() => load()" />

    <div class="page-filter-bar">
      <t-input v-model="keyword" class="ctl-w-xl" placeholder="搜索角色/编码/说明…" clearable @enter="onQuery" />
      <t-button theme="primary" variant="outline" @click="onQuery">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onResetQuery">
        重置
      </t-button>
      <t-button theme="primary" class="toolbar-right" @click="openCreate">
        <template #icon><AddIcon /></template>
        新增角色
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
      >
        <template #name="{ row }">
          <div class="role-name">{{ row.name }}</div>
        </template>
        <template #permCount="{ row }">
          <t-tag variant="light" :theme="row.permCodes.includes('*') ? 'primary' : 'default'">
            {{ permCount(row) }}
          </t-tag>
        </template>
        <template #dataScope="{ row }">
          <span v-if="!row.dataScope || row.dataScope.length === 0" class="scope-all">全部</span>
          <span v-else class="scope-tags">
            <t-tag v-for="d in row.dataScope.slice(0, 3)" :key="d" size="small" variant="light" class="scope-tag">
              {{ scopeLabel(d) }}
            </t-tag>
            <!-- 超出 3 个时折叠为 +N，悬浮可查看完整范围，避免列宽截断丢信息 -->
            <t-tooltip v-if="row.dataScope.length > 3" :content="row.dataScope.map(scopeLabel).join('、')">
              <t-tag size="small" variant="light-outline" class="scope-tag">+{{ row.dataScope.length - 3 }}</t-tag>
            </t-tooltip>
          </span>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="openAssign(row)">权限配置</t-button>
          </div>
        </template>

        <template #empty>
          <ListEmptyState :query="{ keyword: appliedKeyword }" description="暂无角色" @clear="onResetQuery" />
        </template>
      </t-table>
    </div>

    <!-- 权限分配弹窗 -->
    <t-dialog
      v-model:visible="assignVisible"
      :header="`权限配置 · ${current?.name ?? ''}`"
      width="640px"
      @close="assignVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="assignVisible = false">取消</t-button>
          <t-button theme="primary" :loading="saving" :disabled="!dirty" @click="onSave">保存</t-button>
        </div>
      </template>

      <div v-if="current" class="perm-body" :class="{ 'is-locked': isSuper }">
        <t-checkbox
          :model-value="checked.length === allCodes().length"
          :indeterminate="checked.length > 0 && checked.length < allCodes().length"
          :disabled="isSuper"
          label="全选"
          @change="(v: boolean) => {
            checked = v ? allCodes() : []
          }"
        />
        <t-alert
          v-if="isSuper"
          theme="info"
          message="该角色为全量权限（*）：权限点不可编辑，保存时保持全量（*），新增权限点自动生效；如需按权限点限制请修改其他角色。"
          class="block-gap"
        />
        <div class="perm-group scope-group">
          <div class="perm-group-head">
            <span class="perm-group-name">数据范围</span>
            <span class="scope-hint">不勾选 = 不限制（全部）</span>
          </div>
          <t-checkbox-group v-model="scopeDraft" :disabled="isSuper" class="perm-list">
            <t-checkbox v-for="opt in scopeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </t-checkbox-group>
          <div v-if="isSuper" class="scope-hint">超级管理员不受数据范围限制。</div>
        </div>
        <div v-for="g in groups" :key="g.name" class="perm-group">
          <div class="perm-group-head">
            <span class="perm-group-name">{{ g.name }}</span>
            <t-checkbox
              :model-value="groupChecked(g.perms)"
              :indeterminate="groupIndeterminate(g.perms)"
              :disabled="isSuper"
              label="全选"
              :aria-label="`${g.name} 全选`"
              @change="(v: boolean) => toggleGroup(g.perms, v)"
            />
          </div>
          <t-checkbox-group v-model="checked" :disabled="isSuper" class="perm-list">
            <t-checkbox v-for="p in g.perms" :key="p.code" :value="p.code" :label="p.name" />
          </t-checkbox-group>
        </div>
      </div>
    </t-dialog>

    <!-- 新增角色弹窗 -->
    <t-dialog
      v-model:visible="createVisible"
      header="新增角色"
      width="520px"
      @close="createVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="createVisible = false">取消</t-button>
          <t-button theme="primary" :loading="creating" @click="onCreate">保存</t-button>
        </div>
      </template>
      <t-form ref="createFormRef" :data="createForm" :rules="createRules" label-align="top">
        <t-form-item label="角色编码" name="code">
          <t-input v-model="createForm.code" name="code" autocomplete="off" :spellcheck="false" placeholder="小写字母开头，可含数字/下划线，如 content_editor…" />
        </t-form-item>
        <t-form-item label="角色名称" name="name">
          <t-input v-model="createForm.name" name="role-name" autocomplete="off" placeholder="如 内容运营…" />
        </t-form-item>
        <t-form-item label="角色说明" name="description">
          <t-input v-model="createForm.description" name="role-description" autocomplete="off" placeholder="选填，角色职责说明…" />
        </t-form-item>
      </t-form>
      <p class="create-tip">角色创建后初始无任何权限点与数据范围限制，可通过列表「权限配置」按需分配。</p>
    </t-dialog>
  </div>
</template>

<style scoped>
.role-name {
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.block-gap {
  margin-bottom: 12px;
}

.perm-group {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.perm-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.perm-group-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.perm-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.scope-all {
  color: var(--td-text-color-secondary);
}

.scope-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 0;
}

.scope-tag {
  margin-right: 6px;
}

/* 超管：权限矩阵不可编辑，整体降透明度以示禁用态 */
.perm-body.is-locked .perm-group {
  opacity: 0.6;
}

.scope-hint {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.scope-group .scope-hint {
  margin-top: 8px;
}

.create-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}
</style>
