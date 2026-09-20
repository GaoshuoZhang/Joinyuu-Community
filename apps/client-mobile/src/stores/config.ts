import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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
    realnameMode: 'registration',
  })
  let loaded = false

  /* P1 实名核验：后端启用并通过联通测试才显示「实名认证」，否则为「身份信息登记」 */
  const realnameMode = computed<'verified' | 'registration'>(() =>
    config.value.realnameMode === 'verified' ? 'verified' : 'registration',
  )
  const realnameLabel = computed(() => (realnameMode.value === 'verified' ? '实名认证' : '身份信息登记'))

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

  return { config, realnameMode, realnameLabel, ensureLoaded, override }
})
