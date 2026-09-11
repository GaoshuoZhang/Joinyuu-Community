import { httpGet, httpPut } from './http'

/* 角色管理 API（/api/admin/roles）
 * role.permCodes = 权限码集合（'*' 表示全部） */

export interface AdminRole {
  id: string
  code: string
  name: string
  description: string
  permCodes: string[]
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

/** PUT /api/admin/roles/:id/permissions — 入参 { permCodes } */
export async function saveRolePermissions(id: string, permCodes: string[]): Promise<{ code: number }> {
  return httpPut<{ code: number }>(`/roles/${id}/permissions`, { permCodes })
}

/** GET /api/admin/permissions/catalog — 权限点目录（按模块分组） */
export async function fetchPermissionCatalog(): Promise<PermissionGroup[]> {
  return httpGet<PermissionGroup[]>('/permissions/catalog')
}
