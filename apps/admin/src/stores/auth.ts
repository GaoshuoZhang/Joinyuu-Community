import { defineStore } from 'pinia'
import { login as loginApi, logout as logoutApi } from '@/api/auth'
import { hasPermission } from '@/constants/permissions'

const TOKEN_KEY = 'joinyuu_admin_token'
const NAME_KEY = 'joinyuu_admin_name'
const PERMS_KEY = 'joinyuu_admin_perm_codes'

/* 登录态：JWT localStorage 持久化；permissions 权限集合以登录响应为准（无角色即空集合） */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    name: localStorage.getItem(NAME_KEY) || '',
    permissions: loadPerms(),
  }),
  getters: {
    isLogged: (state) => !!state.token,
    /** 权限判定：'*' = 超管全量 */
    hasPerm: (state) => (code: string) => hasPermission(state.permissions, code),
  },
  actions: {
    async login(username: string, password: string, captcha?: { captchaId: string; captchaCode: string }) {
      const res = await loginApi(username, password, captcha)
      this.token = res.token
      this.name = res.name
      this.permissions = res.permissions ?? []
      localStorage.setItem(TOKEN_KEY, res.token)
      localStorage.setItem(NAME_KEY, res.name)
      localStorage.setItem(PERMS_KEY, JSON.stringify(this.permissions))
    },
    async logout() {
      await logoutApi()
      this.token = ''
      this.name = ''
      this.permissions = []
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(NAME_KEY)
      localStorage.removeItem(PERMS_KEY)
    },
  },
})

function loadPerms(): string[] {
  try {
    const raw = localStorage.getItem(PERMS_KEY)
    if (raw) {
      const perms = JSON.parse(raw) as string[]
      if (Array.isArray(perms)) return perms
    }
  } catch {
    /* 权限缓存损坏时按无权限处理 */
  }
  return []
}