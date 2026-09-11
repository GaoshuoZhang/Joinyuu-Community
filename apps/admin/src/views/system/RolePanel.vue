<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchPermissionCatalog, fetchRoles, saveRolePermissions, type AdminRole } from '@/api/roles'
import { permissionGroups as builtinPermissionGroups } from '@/constants/permissions'

/* 角色权限：角色列表 + 权限点分配矩阵（按权限目录分组渲染） */

const loading = ref(true)
const roles = ref<AdminRole[]>([])
const saving = ref(false)

const assignVisible = ref(false)
const current = ref<AdminRole | null>(null)
const checked = ref<string[]>([])

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
  { colKey: 'description', title: '说明', width: 240 , ellipsis: true},
  { colKey: 'permCount', title: '权限数', cell: 'permCount', width: 90 , ellipsis: true},
  { colKey: 'op', title: '操作', cell: 'op', width: 120 },
]

async function load() {
  loading.value = true
  try {
    roles.value = await fetchRoles()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '数据加载失败')
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

async function onSave() {
  if (!current.value) return
  saving.value = true
  try {
    /* 超管角色后端强制全量（*）：保存恒传 ['*']，避免显式集合固化丢失后续新增权限点 */
    const codes = isSuper.value ? ['*'] : checked.value
    await saveRolePermissions(current.value.id, codes)
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
  <div class="role-panel page-fade-in">
    <PageHeader title="角色权限" description="RBAC 角色与权限点管理：分配角色可见可操作的模块" />

    <div class="page-card">
      <t-table
        row-key="id"
        table-layout="fixed"
        hover
        resizable
        :data="roles"
        :columns="columns"
        :loading="loading"
        empty="暂无角色"
      >
        <template #name="{ row }">
          <div class="role-name">{{ row.name }}</div>
        </template>
        <template #permCount="{ row }">
          <t-tag variant="light" :theme="row.permCodes.includes('*') ? 'primary' : 'default'">
            {{ permCount(row) }}
          </t-tag>
        </template>
        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button variant="text" size="small" @click="openAssign(row)">权限配置</t-button>
          </div>
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
          <t-button theme="primary" :loading="saving" @click="onSave">保存</t-button>
        </div>
      </template>

      <div v-if="current" class="perm-body">
        <t-checkbox
          :model-value="checked.length === allCodes().length"
          @change="(v: boolean) => {
            checked = v ? allCodes() : []
          }"
        >
          全选
        </t-checkbox>
        <t-alert
          v-if="isSuper"
          theme="info"
          message="该角色为全量权限（*）：保存时保持全量（*），新增权限点自动生效；如需按权限点限制请修改其他角色。"
          class="block-gap"
        />
        <div v-for="g in groups" :key="g.name" class="perm-group">
          <div class="perm-group-head">
            <span class="perm-group-name">{{ g.name }}</span>
            <t-checkbox
              :model-value="groupChecked(g.perms)"
              @change="(v: boolean) => toggleGroup(g.perms, v)"
            />
          </div>
          <t-checkbox-group v-model="checked" class="perm-list">
            <t-checkbox v-for="p in g.perms" :key="p.code" :value="p.code" :label="p.name" />
          </t-checkbox-group>
        </div>
      </div>
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.perm-body {
  max-height: 480px;
  overflow-y: auto;
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
</style>