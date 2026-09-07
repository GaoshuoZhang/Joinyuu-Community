import { defineStore } from 'pinia'
import { login as loginApi, logout as logoutApi } from '@/api/auth'

/* 登录态：Mock JWT，localStorage 持久化，刷新不掉线 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('joinyuu_admin_token') || '',
    name: localStorage.getItem('joinyuu_admin_name') || '',
  }),
  getters: {
    isLogged: (state) => !!state.token,
  },
  actions: {
    async login(username: string, password: string) {
      const res = await loginApi(username, password)
      this.token = res.token
      this.name = res.name
      localStorage.setItem('joinyuu_admin_token', res.token)
      localStorage.setItem('joinyuu_admin_name', res.name)
    },
    async logout() {
      await logoutApi()
      this.token = ''
      this.name = ''
      localStorage.removeItem('joinyuu_admin_token')
      localStorage.removeItem('joinyuu_admin_name')
    },
  },
})
