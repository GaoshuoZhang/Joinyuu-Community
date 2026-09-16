import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import { fetchMe } from '@/api/me'
import type { AuthResult, IdentityType, UserIdentity } from '@/types'

const TOKEN_KEY = 'joinyuu_client_token'

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

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? '')
  const uid = ref('')
  const name = ref('')
  const avatar = ref('')
  const identities = ref<UserIdentity[]>([])
  const points = ref(0)

  const isLogged = computed(() => token.value !== '')
  const primaryIdentity = computed<IdentityType>(() => identities.value[0]?.type ?? 'individual')
  /** 是否持社区个体身份（决定个人名片 / 我的等级入口） */
  const hasCommunityIndividual = computed(() => identities.value.some((i) => i.type === 'community_individual'))

  /** 资料卡标签：个人用户为基础身份，不在资料卡重复展示 */
  const profileIdentities = computed<UserIdentity[]>(() => identities.value.filter((i) => i.type !== 'individual'))

  let restorePromise: Promise<void> | null = null

  /** 刷新后恢复会话（守卫首次跳转前 await 一次）。
   * v38 修复：恢复请求失败（离线/超时/500 等）时不得让路由守卫 reject（否则整页空白），
   * 失败后允许后续导航重试恢复。 */
  function ensureRestored(): Promise<void> {
    if (restorePromise) return restorePromise
    restorePromise = authApi
      .restoreSession()
      .then((result) => {
        if (result) apply(result)
      })
      .catch(() => {
        restorePromise = null
      })
    return restorePromise ?? Promise.resolve()
  }

  function apply(result: AuthResult) {
    token.value = result.token
    localStorage.setItem(TOKEN_KEY, result.token)
    uid.value = result.uid
    name.value = result.name
    avatar.value = result.avatar ?? ''
    identities.value = result.identities
    points.value = result.points
  }

  async function login(payload: { phone: string; password: string; captchaId: string; captchaCode: string }) {
    apply(await authApi.login(payload))
  }

  async function register(payload: { phone: string; password: string; confirmPassword: string; captchaId: string; captchaCode: string; nickname?: string; agreed?: boolean }) {
    apply(await authApi.register(payload))
  }

  /** 清空本地会话（登出与 401 拦截统一入口） */
  function clearSession() {
    token.value = ''
    uid.value = ''
    name.value = ''
    avatar.value = ''
    identities.value = []
    points.value = 0
    localStorage.removeItem(TOKEN_KEY)
  }

  async function logout() {
    await authApi.logout()
    clearSession()
  }

  /** 同步最新资料（积分/昵称/头像）：响应需求、签到、兑换等积分变动后由页面调用 */
  async function refreshProfile() {
    if (!isLogged.value) return
    try {
      const me = await fetchMe()
      if (!me || me.uid !== uid.value) return
      name.value = me.nickname
      avatar.value = me.avatar ?? ''
      identities.value = me.identities
      points.value = me.points
    } catch {
      /* 拉取失败时保留本地缓存 */
    }
  }

  return {
    token, uid, name, avatar, identities, points,
    isLogged, primaryIdentity, hasCommunityIndividual, profileIdentities,
    ensureRestored, login, register, logout, clearSession, refreshProfile,
  }
})
