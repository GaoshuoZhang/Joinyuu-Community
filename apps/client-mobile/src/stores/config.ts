import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchAppConfig } from '@/api/config'
import { applyFavicon } from '@/utils/siteBranding'
import type { AppConfig } from '@/types'

/** 站点配置与功能开关（登录页/首页下发；写端点服务端二次校验） */
export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>({
    siteName: '聚屿社区',
    siteSlogan: '',
    siteLogo: '',
    mobileUrl: 'localhost:7759',
    registrationOpen: true,
    phoneRegisterOpen: true,
    emailRegisterOpen: true,
    mallOpen: true,
    demandOpen: true,
    reservationOpen: true,
    homeCarouselOpen: true,
    realnameMode: 'registration',
  })
  let loaded = false
  /** 首页/登录页/启动钩子可能同时触发 ensureLoaded：复用同一次请求，避免冷启动并发拉取同一接口 */
  let inflight: Promise<void> | null = null

  /* P1 实名核验：后端启用并通过联通测试才显示「实名认证」，否则为「身份信息登记」 */
  const realnameMode = computed<'verified' | 'registration'>(() =>
    config.value.realnameMode === 'verified' ? 'verified' : 'registration',
  )
  const realnameLabel = computed(() => (realnameMode.value === 'verified' ? '实名认证' : '身份信息登记'))

  async function ensureLoaded(force = false): Promise<void> {
    if (loaded && !force) return
    if (inflight) return inflight
    inflight = (async () => {
      config.value = await fetchAppConfig()
      loaded = true
      /* 站点 logo（「系统配置 → 站点信息」）作为浏览器标签页图标 */
      applyFavicon(config.value.siteLogo)
    })().finally(() => {
      inflight = null
    })
    return inflight
  }

  return { config, realnameMode, realnameLabel, ensureLoaded }
})
