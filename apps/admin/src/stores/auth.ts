import { defineStore } from 'pinia'
import { login as loginApi, logout as logoutApi } from '@/api/auth'
import { useTabsStore } from '@/stores/tabs'
import { hasPermission } from '@/constants/permissions'

const TOKEN_KEY = 'joinyuu_admin_token'
const NAME_KEY = 'joinyuu_admin_name'
const PERMS_KEY = 'joinyuu_admin_perm_codes'
const SCOPE_KEY = 'joinyuu_admin_scope_codes'

/* 登录态：JWT localStorage 持久化；permissions 权限集合与 dataScope 数据范围以登录响应为准
 * （无角色即空集合；dataScope 空数组 = 不限制全部域） */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    name: localStorage.getItem(NAME_KEY) || '',
    permissions: loadPerms(),
    dataScope: loadScope(),
    /** 密码已过期：token 保留，但仅允许修改密码（由路由/接口 403 引导） */
    passwordExpired: false,
  }),
  getters: {
    isLogged: (state) => !!state.token,
    /** 权限判定：'*' = 超管全量 */
    hasPerm: (state) => (code: string | string[]) => hasPermission(state.permissions, code),
  },
  actions: {
    async login(username: string, password: string, captcha?: { captchaId: string; captchaCode: string }) {
      const res = await loginApi(username, password, captcha)
      this.token = res.token
      this.name = res.name
      this.permissions = res.permissions ?? []
      this.dataScope = res.dataScope ?? []
      this.passwordExpired = res.passwordExpired ?? false
      localStorage.setItem(TOKEN_KEY, res.token)
      localStorage.setItem(NAME_KEY, res.name)
      localStorage.setItem(PERMS_KEY, JSON.stringify(this.permissions))
      localStorage.setItem(SCOPE_KEY, JSON.stringify(this.dataScope))
    },
    /* 登出：接口失败也必须清理本地登录态（try/finally 兜底，避免"已登出但仍持 token"） */
    async logout() {
      try {
        await logoutApi()
      } finally {
        resetAuth()
      }
    },
  },
})

/** 统一重置登录态：清本地缓存 + Pinia 内存态 + 标签页；
 * 登出兜底与 http 401 共用，避免多标签页按旧权限继续渲染 */
export function resetAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(NAME_KEY)
  localStorage.removeItem(PERMS_KEY)
  localStorage.removeItem(SCOPE_KEY)
  /* 会话级缓存一并清空，避免残留旧权限快照 */
  sessionStorage.clear()
  try {
    const auth = useAuthStore()
    auth.token = ''
    auth.name = ''
    auth.permissions = []
    auth.dataScope = []
    auth.passwordExpired = false
    useTabsStore().clear()
  } catch {
    /* Pinia 未安装的极早期场景：无内存态可清，仅保留缓存清理结果 */
  }
}

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

function loadScope(): string[] {
  try {
    const raw = localStorage.getItem(SCOPE_KEY)
    if (raw) {
      const scope = JSON.parse(raw) as string[]
      if (Array.isArray(scope)) return scope
    }
  } catch {
    /* 数据范围缓存损坏时按不限制全部域处理 */
  }
  return []
}
