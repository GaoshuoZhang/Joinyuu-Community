<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { LogoGithubIcon, MailIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { useBrandingStore } from '@/stores/branding'
import { fetchServiceHealth } from '@/api/health'
import { APP_VERSION } from '@/version'

/* 关于（系统管理 → 关于）：站点信息（系统配置 > 站点信息，空 logo 回退内置字标）+ 版本信息 +
 * 开发者联系方式。与客户端「关于」页信息结构对齐，但去掉客户端专有的「定制UI版本号」（后台无主题概念）。
 * 开发者链接与邮箱为常量，非用户输入，因此无需过 safeHttpUrl 白名单。 */
const branding = useBrandingStore()

const siteName = computed(() => branding.siteName)
const slogan = computed(() => branding.siteSlogan)

/* 服务端版本取自公开探活接口 /api/health（见 docs/versioning.md）。
 * null = 读取中，'' = 读取失败（只影响这一行展示，不影响页面其它内容） */
const serverVersion = ref<string | null>(null)
onMounted(async () => {
  try {
    serverVersion.value = (await fetchServiceHealth()).version
  } catch {
    serverVersion.value = ''
  }
})

const DEVELOPER_GITHUB = 'https://github.com/GaoshuoZhang'
const DEVELOPER_GITHUB_LABEL = 'github.com/GaoshuoZhang'
const CONTACT_EMAIL = 'gaoshuo.zhang@qq.com'
</script>

<template>
  <div class="about-page page-fade-in">
    <PageHeader title="关于" description="站点信息与开发者联系方式" />

    <section class="page-card brand-card">
      <img v-if="branding.siteLogo" class="brand-logo" :src="branding.siteLogo" alt="" />
      <span v-else class="logo-glyph" aria-hidden="true">聚</span>
      <h3 class="brand-name">{{ siteName }}</h3>
      <p v-if="slogan" class="slogan">{{ slogan }}</p>
    </section>

    <section class="page-card">
      <h3 class="sec-title">版本信息</h3>
      <div class="versions">
        <div class="ver-row">
          <span class="ver-label">管理后台</span>
          <span class="ver-value">v{{ APP_VERSION }}</span>
        </div>
        <div class="ver-row">
          <span class="ver-label">服务端</span>
          <span class="ver-value">{{ serverVersion === null ? '读取中…' : serverVersion ? `v${serverVersion}` : '暂不可用' }}</span>
        </div>
      </div>
    </section>

    <section class="page-card">
      <h3 class="sec-title">开发者</h3>
      <div class="contacts">
        <a class="ext" :href="DEVELOPER_GITHUB" target="_blank" rel="noopener">
          <LogoGithubIcon aria-hidden="true" /><span class="ext-text">{{ DEVELOPER_GITHUB_LABEL }}</span>
        </a>
        <a class="ext" :href="`mailto:${CONTACT_EMAIL}`">
          <MailIcon aria-hidden="true" /><span class="ext-text">{{ CONTACT_EMAIL }}</span>
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.about-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.brand-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 24px;
  text-align: center;
}

.brand-logo {
  width: auto;
  max-width: 160px;
  height: 48px;
  object-fit: contain;
  border-radius: var(--td-radius-default);
}

/* 未配置站点 logo 时的内置字标：品牌色底 + 反色字（与后台左上角字标同风格） */
.logo-glyph {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--td-radius-large);
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  font-size: 24px;
  font-weight: 600;
}

.brand-name {
  margin: 0;
  font-size: 20px;
  line-height: 28px;
  color: var(--td-text-color-primary);
  overflow-wrap: anywhere;
}

.slogan {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}

.sec-title {
  margin: 0 0 12px;
  font-size: 16px;
  line-height: 24px;
  color: var(--td-text-color-primary);
}

/* 版本信息：标签在左、版本号在右；版本号用等宽数字保证上下对齐 */
.versions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ver-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  line-height: 22px;
}

.ver-label {
  color: var(--td-text-color-secondary);
}

.ver-value {
  color: var(--td-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.contacts {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

/* 外链与邮箱：图标与文字沿水平中线对齐；下划线表达可点性（落在文本 span 上——
 * flex 容器上的 text-decoration 不会传播到 flex 子项） */
.ext {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-brand);
  min-width: 0;
}

.ext-text {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
}

.ext :deep(.t-icon) {
  flex-shrink: 0;
}
</style>
