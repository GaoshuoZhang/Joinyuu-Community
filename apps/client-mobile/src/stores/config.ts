import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchAppConfig } from '@/api/config'
import type { AppConfig } from '@/types'

/** 站点配置与功能开关（登录页/首页下发；写端点服务端二次校验） */
export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>({
    siteName: '聚屿社区',
    siteSlogan: '',
    registrationOpen: true,
    mallOpen: true,
    demandOpen: true,
    reservationOpen: true,
    homeCarouselOpen: true,
  })
  let loaded = false

  async function ensureLoaded(force = false): Promise<void> {
    if (loaded && !force) return
    config.value = await fetchAppConfig()
    loaded = true
  }

  /** [MOCK-ONLY] devtools 开关面板实时覆写（接入期由管理端系统配置驱动） */
  function override(next: Partial<AppConfig>): void {
    config.value = { ...config.value, ...next }
    loaded = true
  }

  return { config, ensureLoaded, override }
})
