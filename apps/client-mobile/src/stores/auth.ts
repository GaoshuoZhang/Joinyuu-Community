import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import type { AuthResult, IdentityType, UserIdentity } from '@/types'

const TOKEN_KEY = 'joinyuu_client_token'
const IDENTITY_KEY = 'joinyuu_client_identity'

/** 身份中文标签（与 IdentityTag 口径一致，供顶栏/切换面板复用） */
export const IDENTITY_LABELS: Record<IdentityType, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? '')
  const uid = ref('')
  const name = ref('')
  const identities = ref<UserIdentity[]>([])
  const points = ref(0)
  /** 当前身份（切换后持久化；重登录时若不再拥有则回落） */
  const currentIdentity = ref<IdentityType | ''>((localStorage.getItem(IDENTITY_KEY) as IdentityType) || '')

  const isLogged = computed(() => token.value !== '')
  const primaryIdentity = computed<IdentityType>(() => identities.value[0]?.type ?? 'individual')
  /** 是否持社区身份（community_individual/community_enterprise，含经验等级） */
  const communityIdentities = computed(() => identities.value.filter((i) => i.type === 'community_individual' || i.type === 'community_enterprise'))

  /** 可切换身份：社区个体已涵盖个人用户，持有社区个体时不再单列「个人用户」 */
  const switchableIdentities = computed<UserIdentity[]>(() => {
    const hasCommunityIndividual = identities.value.some((i) => i.type === 'community_individual')
    return identities.value.filter((i) => !(i.type === 'individual' && hasCommunityIndividual))
  })

  /** 资料卡标签：个人用户为基础身份，不在资料卡重复展示 */
  const profileIdentities = computed<UserIdentity[]>(() => identities.value.filter((i) => i.type !== 'individual'))

  /** 当前身份（回落 primary），用于顶栏展示 */
  const activeIdentity = computed<IdentityType>(() => {
    const cur = currentIdentity.value
    if (cur && identities.value.some((i) => i.type === cur)) return cur
    return switchableIdentities.value[0]?.type ?? primaryIdentity.value
  })

  const activeIdentityLabel = computed(() => IDENTITY_LABELS[activeIdentity.value] ?? '')

  /** 当前身份主名称（顶栏大字）：社区企业显示企业名、合作企业显示主体名，其余显示昵称 */
  const activeIdentityName = computed(() => {
    const cur = identities.value.find((i) => i.type === activeIdentity.value)
    if (cur?.type === 'community_enterprise') return cur.enterpriseName || name.value
    if (cur?.type === 'external_enterprise') return cur.organizationName || name.value
    return name.value
  })

  function switchIdentity(type: IdentityType) {
    if (!identities.value.some((i) => i.type === type)) return
    currentIdentity.value = type
    localStorage.setItem(IDENTITY_KEY, type)
  }

  let restorePromise: Promise<void> | null = null

  /** 刷新后恢复会话（守卫首次跳转前 await 一次） */
  function ensureRestored(): Promise<void> {
    restorePromise ??= authApi.restoreSession().then((result) => {
      if (result) apply(result)
    })
    return restorePromise
  }

  function apply(result: AuthResult) {
    token.value = result.token
    localStorage.setItem(TOKEN_KEY, result.token)
    uid.value = result.uid
    name.value = result.name
    identities.value = result.identities
    points.value = result.points
    /* 当前身份不再拥有时回落到首个可切换身份 */
    if (!currentIdentity.value || !result.identities.some((i) => i.type === currentIdentity.value)) {
      const first = switchableIdentities.value[0]?.type ?? primaryIdentity.value
      currentIdentity.value = first
      localStorage.setItem(IDENTITY_KEY, first)
    }
  }

  async function login(payload: { phone: string; password: string; captchaCode: string }) {
    apply(await authApi.login(payload))
  }

  async function register(payload: { phone: string; password: string; confirmPassword: string; captchaCode: string; nickname?: string }) {
    apply(await authApi.register(payload))
  }

  async function logout() {
    await authApi.logout()
    token.value = ''
    uid.value = ''
    name.value = ''
    identities.value = []
    points.value = 0
    currentIdentity.value = ''
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(IDENTITY_KEY)
  }

  return {
    token, uid, name, identities, points, currentIdentity,
    isLogged, primaryIdentity, communityIdentities, switchableIdentities, profileIdentities, activeIdentity, activeIdentityLabel, activeIdentityName,
    ensureRestored, login, register, logout, switchIdentity,
  }
})
