import { httpGet, httpPost, httpPut } from './http'

/* 角色管理 API（/api/admin/roles）
 * role.permCodes = 权限码集合（'*' 表示全部）；role.dataScope = 数据范围域集合（空数组 = 不限制全部） */

export interface AdminRole {
  id: string
  code: string
  name: string
  description: string
  permCodes: string[]
  dataScope: string[]
}

export interface PermissionItem {
  code: string
  name: string
  authType: string
}

export interface PermissionGroup {
  name: string
  perms: PermissionItem[]
}

/** GET /api/admin/roles */
export async function fetchRoles(): Promise<AdminRole[]> {
  return httpGet<AdminRole[]>('/roles')
}

/** POST /api/admin/roles — 新增自定义角色（初始无权限点，经权限配置分配） */
export async function createRole(payload: { code: string; name: string; description?: string }): Promise<AdminRole> {
  return httpPost<AdminRole>('/roles', payload)
}

/** PUT /api/admin/roles/:id/assignment — 权限 + 数据范围合并保存（后端单事务，避免部分失败中间态） */
export async function saveRoleAssignment(id: string, permCodes: string[], dataScope: string[]): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/roles/${id}/assignment`, { permCodes, dataScope })
}

/** GET /api/admin/permissions/catalog — 权限点目录（按模块分组） */
export async function fetchPermissionCatalog(): Promise<PermissionGroup[]> {
  return httpGet<PermissionGroup[]>('/permissions/catalog')
}
