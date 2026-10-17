<script setup lang="ts">
import { computed } from 'vue'
import { Cell, CellGroup, Icon } from 'tdesign-mobile-vue'
import CustomerBrandLogo from '@/components/CustomerBrandLogo.vue'
import { useConfigStore } from '@/stores/config'
import { useCustomerThemeStore } from '@/stores/customerTheme'
import { APP_VERSION } from '@/version'

/* 关于：客户品牌信息（取自当前启用的移动端主题）+ 版本信息 + 开发者联系方式 + 用户协议与隐私政策入口。
 * 开发者链接与邮箱为常量，非用户输入，因此无需过 safeHttpUrl 白名单。 */
const config = useConfigStore()
const customerTheme = useCustomerThemeStore()

const brand = computed(() => customerTheme.theme?.brand)
const siteName = computed(() => brand.value?.name || config.config.siteName || '聚屿社区')
const slogan = computed(() => (brand.value?.slogan || config.config.siteSlogan || '').trim())
const themeVersion = computed(() => customerTheme.theme?.version || '')
/* 服务端版本随站点配置下发（见 docs/versioning.md）；老版本后端不下发时该行不展示 */
const serverVersion = computed(() => config.config.version || '')

const DEVELOPER_GITHUB = 'https://github.com/GaoshuoZhang'
const DEVELOPER_GITHUB_LABEL = 'github.com/GaoshuoZhang'
const CONTACT_EMAIL = 'gaoshuo.zhang@qq.com'
</script>

<template>
  <div class="page-fade-in about">
    <!-- 客户信息：主题提供 Logo 时展示 Logo（含深色版），无主题时回退公版字标与站点名 -->
    <section class="m-card hero">
      <CustomerBrandLogo v-if="brand?.logo" class="brand-logo" :brand="brand" />
      <span v-else class="logo-glyph" aria-hidden="true">聚</span>
      <h2 class="brand-name">{{ siteName }}</h2>
      <p v-if="slogan" class="slogan">{{ slogan }}</p>
      <p class="app-version">软件版本 v{{ APP_VERSION }}</p>
      <p v-if="serverVersion" class="server-version">服务端版本 v{{ serverVersion }}</p>
      <p v-if="themeVersion" class="theme-version">定制UI版本号 v{{ themeVersion }}</p>
    </section>

    <section class="m-card">
      <h3 class="sec-title">开发者</h3>
      <div class="contacts">
        <a class="ext" :href="DEVELOPER_GITHUB" target="_blank" rel="noopener">
          <Icon aria-hidden="true" name="logo-github" size="16px" /><span class="ext-text">{{ DEVELOPER_GITHUB_LABEL }}</span>
        </a>
        <a class="ext" :href="`mailto:${CONTACT_EMAIL}`">
          <Icon aria-hidden="true" name="mail" size="16px" /><span class="ext-text">{{ CONTACT_EMAIL }}</span>
        </a>
      </div>
    </section>

    <div class="privacy-group">
      <CellGroup theme="card">
        <router-link class="cell-link" to="/privacy" aria-label="用户协议与隐私政策"><Cell title="用户协议与隐私政策" arrow /></router-link>
      </CellGroup>
    </div>
  </div>
</template>

<style scoped>
.about {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-8) var(--app-space-7);
  text-align: center;
}

/* 字标/方形 Logo 统一按 44px 高度等比缩放（与登录页同口径，随明暗模式切换明暗版本） */
.brand-logo {
  display: inline-flex;
  align-items: center;
  margin-bottom: var(--app-space-2);
}

.brand-logo :deep(.customer-logo) {
  width: auto;
  height: 44px;
}

/* 无主题时的公版字标：品牌色底 + 反色字，与登录页兜底一致 */
.logo-glyph {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: var(--app-space-2);
  border-radius: var(--td-radius-large);
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  font: var(--app-type-display);
}

.brand-name {
  margin: 0;
  font: var(--app-type-page-title);
  overflow-wrap: anywhere;
}

.slogan {
  margin: 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
}

/* 版本信息三行（软件版本 / 服务端版本 / 定制UI版本号）统一走次级小字口径 */
.app-version,
.server-version,
.theme-version {
  margin: 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.sec-title {
  margin: 0 0 var(--app-space-5);
  font: var(--app-type-card-title);
}

/* 联系方式：逐行左对齐排列，行间用页面间距 token */
.contacts {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--app-space-5);
}

/* 外链与邮箱：图标与链接文字沿水平中线居中对齐；文字加下划线表达可点性
 * （部分主题的品牌文字色与正文同色，仅靠颜色无法表达可点性；同 ArticleContent 口径）。
 * 下划线必须落在文本 span 上：flex 容器上的 text-decoration 不会传播到 flex 子项。 */
.ext {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-4);
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

.ext:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
  border-radius: var(--td-radius-small);
}

/* CellGroup 自带左右 16px 外边距，与页面 padding 叠加会导致卡片偏窄 */
.privacy-group :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}

.cell-link {
  display: block;
  color: inherit;
  text-decoration: none;
}

.cell-link:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: -2px;
}
</style>
