import { httpGet, httpPatch, httpPost, httpPut } from './http'

/* 管理员账号 API（/api/admin/admins）
 * AdminAccount 接口形状；roleCodes = 角色码集合（授权用） */

export interface AdminAccount {
  id: number
  username: string
  name: string
  roleCodes: string[]
  status: 'active' | 'disabled'
  lastLoginAt?: string
  createdAt: string
}

export interface AdminAccountPayload {
  username: string
  name: string
  roleCodes: string[]
}

export function fetchAdminRoleOptions(): Promise<{ code: string; name: string }[]> {
  return httpGet('/admins/role-options')
}

/** GET /api/admin/admins?keyword */
export async function fetchAdmins(keyword?: string): Promise<AdminAccount[]> {
  const qs = keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''
  const res = await httpGet<{ list: AdminAccount[]; total: number }>(`/admins${qs}`)
  return res.list
}

/** POST /api/admin/admins（新增）与 PUT /api/admin/admins/:id（编辑）
 * 新增时后端返回随机初始密码（未显式提供时），由调用方展示一次 */
export async function saveAdmin(
  id: number | null,
  payload: AdminAccountPayload,
): Promise<{ code: number; initialPassword?: string }> {
  if (id == null) {
    const res = await httpPost<{ id: number; initialPassword?: string }>('/admins', {
      username: payload.username,
      name: payload.name,
      roleCodes: payload.roleCodes,
    })
    return { code: 0, initialPassword: res.initialPassword }
  }
  await httpPut<{ code: number }>(`/admins/${id}`, { name: payload.name, roleCodes: payload.roleCodes })
  return { code: 0 }
}

/** PATCH /api/admin/admins/:id/status — 入参 { status } */
export async function updateAdminStatus(id: number, status: 'active' | 'disabled'): Promise<{ code: number }> {
  return httpPatch<{ code: number }>(`/admins/${id}/status`, { status })
}

/** POST /api/admin/admins/:id/reset-password — 入参 { password } */
export async function resetAdminPassword(id: number, password: string): Promise<{ code: number }> {
  return httpPost<{ code: number }>(`/admins/${id}/reset-password`, { password })
}
