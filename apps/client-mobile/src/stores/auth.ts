import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as authApi from '@/api/auth'
import type { AuthResult, IdentityType, UserIdentity } from '@/types'

const TOKEN_KEY = 'joinyuu_client_token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) ?? '')
  const uid = ref('')
  const name = ref('')
  const identities = ref<UserIdentity[]>([])
  const points = ref(0)

  const isLogged = computed(() => token.value !== '')
  const primaryIdentity = computed<IdentityType>(() => identities.value[0]?.type ?? 'individual')
  /** 是否持社区身份（community_individual/community_enterprise，含经验等级） */
  const communityIdentities = computed(() => identities.value.filter((i) => i.type === 'community_individual' || i.type === 'community_enterprise'))

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
    localStorage.removeItem(TOKEN_KEY)
  }

  return { token, uid, name, identities, points, isLogged, primaryIdentity, communityIdentities, ensureRestored, login, register, logout }
})
