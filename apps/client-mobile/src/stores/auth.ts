import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import { ApiError } from '@/api/http'
import { fetchMe } from '@/api/me'
import { useNoticesStore } from './notices'
import type { AuthResult, IdentityType, LoginPayload, RegisterPayload, UserIdentity } from '@/types'

const TOKEN_KEY = 'joinyuu_client_token'
const IDENTITY_KEY = 'joinyuu_client_identity'

/** 从 JWT（真实或 mock 同形态）读取 exp（秒）；无法解析返回 0（视为「未知」不做过期拦截，服务端为准） */
export function readTokenExp(raw: string): number {
  try {
    const payload = raw.split('.')[1]
    if (!payload) return 0
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = new TextDecoder().decode(Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0)))
    const parsed = JSON.parse(json) as { exp?: number }
    return typeof parsed.exp === 'number' ? parsed.exp : 0
  } catch {
    return 0
  }
}

/** 身份中文标签（与 IdentityTag 口径一致，供顶栏/发布身份等复用） */
export const IDENTITY_LABELS: Record<IdentityType, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
}

/** 「发布身份」选项文案：个人身份展示昵称，企业身份展示企业名/组织名（即发布后列表展示的发布方） */
export function identityOptionLabel(identity: UserIdentity, personName: string): string {
  if (identity.type === 'community_enterprise') return `${IDENTITY_LABELS[identity.type]} · ${identity.enterpriseName ?? personName}`
  if (identity.type === 'external_enterprise') return `${IDENTITY_LABELS[identity.type]} · ${identity.organizationName ?? personName}`
  return `${IDENTITY_LABELS[identity.type]} · ${personName}`
}

/** 行为身份选项：社区个体是个人用户的升级身份，两者不同时展示。 */
export function actionIdentityOptions(identities: readonly UserIdentity[]): UserIdentity[] {
  const hasCommunityIndividual = identities.some((identity) => identity.type === 'community_individual')
  return identities.filter((identity) => !hasCommunityIndividual || identity.type !== 'individual')
}

export const useAuthStore = defineStore('auth', () => {
  const persistedToken = localStorage.getItem(TOKEN_KEY) ?? ''
  const token = ref(persistedToken)
  /** 令牌过期时间（秒）；0 = 无法解析（不做过期拦截，以服务端校验为准） */
  const tokenExp = ref(persistedToken ? readTokenExp(persistedToken) : 0)
  const uid = ref('')
  const username = ref('')
  const name = ref('')
  const avatar = ref('')
  const identities = ref<UserIdentity[]>([])
  const points = ref(0)

  /** 令牌存在且未过期（exp 可解析时才做过期判定） */
  const isLogged = computed(
    () => token.value !== '' && (tokenExp.value === 0 || tokenExp.value * 1000 > Date.now()),
  )
  const primaryIdentity = computed<IdentityType>(() => identities.value[0]?.type ?? 'individual')
  /** 是否持社区个体身份（决定个人名片 / 我的等级入口） */
  const hasCommunityIndividual = computed(() => identities.value.some((i) => i.type === 'community_individual'))

  /** 资料卡标签：个人用户为基础身份，不在资料卡重复展示 */
  const profileIdentities = computed<UserIdentity[]>(() => identities.value.filter((i) => i.type !== 'individual'))

  let restorePromise: Promise<void> | null = null

  /** 刷新后恢复会话（守卫首次跳转前 await 一次）。
   * 失败区分两类处理：鉴权类（401/403）→ 清理本地会话；网络/服务类 → 保留会话并允许后续导航重试。 */
  function ensureRestored(): Promise<void> {
    if (restorePromise) return restorePromise
    restorePromise = authApi
      .restoreSession()
      .then((result) => {
        if (!result) {
          /* 令牌不存在/已过期/损坏：显式清空，避免停留为「已登录」假象 */
          resetSession()
          return
        }
        apply(result)
      })
      .catch((error: unknown) => {
        const code = error instanceof ApiError ? error.code : 0
        if (code === 401 || code === 403) resetSession()
        /* 网络/超时/5xx：保留本地令牌，允许后续导航重试恢复 */
        restorePromise = null
      })
    return restorePromise ?? Promise.resolve()
  }

  function apply(result: AuthResult) {
    token.value = result.token
    tokenExp.value = readTokenExp(result.token)
    localStorage.setItem(TOKEN_KEY, result.token)
    uid.value = result.uid
    username.value = result.username
    name.value = result.name
    avatar.value = result.avatar ?? ''
    identities.value = result.identities
    points.value = result.points
  }

  async function login(payload: LoginPayload) {
    apply(await authApi.login(payload))
  }

  async function register(payload: RegisterPayload) {
    apply(await authApi.register(payload))
  }

  /** 统一清理会话（登出 / 改密 / 重置密码 / 401 拦截 / 恢复失败）：清 auth 状态 + 站内信缓存 + 本地会话键，
   * 避免换账号登录时旧站内信列表残留。 */
  function resetSession() {
    token.value = ''
    tokenExp.value = 0
    uid.value = ''
    username.value = ''
    name.value = ''
    avatar.value = ''
    identities.value = []
    points.value = 0
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(IDENTITY_KEY)
    useNoticesStore().reset()
  }

  /* 启动即清理已过期令牌（http 与 mock 同口径），避免「已登录但接口全 401」的假象 */
  if (token.value && tokenExp.value !== 0 && tokenExp.value * 1000 <= Date.now()) resetSession()

  async function logout() {
    await authApi.logout()
    resetSession()
  }

  /** 同步最新资料（积分/昵称/头像）：响应需求、签到、兑换等积分变动后由页面调用 */
  async function refreshProfile() {
    if (!isLogged.value) return
    try {
      const me = await fetchMe()
      if (!me || me.uid !== uid.value) return
      username.value = me.username
      name.value = me.nickname
      avatar.value = me.avatar ?? ''
      identities.value = me.identities
      points.value = me.points
    } catch {
      /* 拉取失败时保留本地缓存 */
    }
  }

  return {
    token, uid, username, name, avatar, identities, points,
    isLogged, primaryIdentity, hasCommunityIndividual, profileIdentities,
    ensureRestored, login, register, logout, resetSession, refreshProfile,
  }
})
