<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loading } from 'tdesign-mobile-vue'
import DOMPurify from 'dompurify'
import { fetchAgreementPolicy } from '@/api/community'
import type { AgreementPolicy } from '@/types'

/* 用户协议与隐私政策：读取后台已发布的最新版本（GET /api/app/policies/:kind，富文本经 DOMPurify 清洗）；
 * 接口不可用时回退到演示文本，保证注册页与政策页始终可读。 */
const loading = ref(true)
const agreements = ref<AgreementPolicy[]>([])
const failed = ref(false)

onMounted(async () => {
  try {
    agreements.value = await Promise.all([
      fetchAgreementPolicy('user_agreement'),
      fetchAgreementPolicy('privacy_policy'),
    ])
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
})

const sections = computed(() =>
  agreements.value.map((item) => ({ ...item, html: DOMPurify.sanitize(item.content) })),
)

const DEMO_DATE = '2026-09-15'
</script>

<template>
  <div class="page-fade-in m-privacy">
    <h1 class="title">用户协议与隐私政策</h1>

    <Loading v-if="loading" class="state" text="加载中…" />

    <template v-else-if="sections.length">
      <section v-for="item in sections" :key="item.kind" class="m-card">
        <div class="doc-head">
          <h2>{{ item.title }}</h2>
          <span class="doc-meta">{{ item.version }} · 更新于 {{ item.publishedAt }}</span>
        </div>
        <div class="rich-content" v-html="item.html"></div>
      </section>
    </template>

    <template v-else>
      <p class="updated">更新日期：{{ DEMO_DATE }}（演示文本）</p>

      <section class="m-card">
        <h2>一、服务说明</h2>
        <p>聚屿社区为创业社区成员提供需求对接、活动报名、空间预约、内容投稿与积分兑换等服务。使用本服务前，请完整阅读并同意本协议。</p>
      </section>

      <section class="m-card">
        <h2>二、账号与身份</h2>
        <p>注册需提供手机号；社区个体 / 社区企业等身份需经社区运营审核。你应对账号下的一切行为负责，不得冒用他人身份或企业资质。</p>
      </section>

      <section class="m-card">
        <h2>三、个人信息收集与使用</h2>
        <p>我们仅收集提供服务所必需的信息：手机号（登录与通知）、昵称与头像（展示）、实名信息（身份核验）、收货地址（实物兑换邮寄）。收集前会单独征求同意，你可以随时在「账号与安全」中申请导出或注销。</p>
      </section>

      <section class="m-card">
        <h2>四、内容与行为规范</h2>
        <p>发布的需求、响应、投稿与名片内容应真实合规；禁止虚假信息、骚扰、侵权与违规经营。违规内容将被下架，情节严重者限制或终止服务。</p>
      </section>

      <section class="m-card">
        <h2>五、联系与申诉</h2>
        <p>对审核结果有异议可在对应内容处提交申诉；对举报处理有疑问可通过站内信联系社区运营。</p>
      </section>

      <p v-if="failed" class="demo-tip">政策服务暂时不可用，以上为演示文本。</p>
    </template>
  </div>
</template>

<style scoped>
.m-privacy {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 20px;
}

.updated,
.demo-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.state {
  padding: 20px 0;
}

.doc-head {
  margin-bottom: 8px;
}

.doc-head h2 {
  margin: 0;
  font-size: 15px;
}

.doc-meta {
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.m-card h2 {
  margin: 0 0 8px;
  font-size: 14px;
}

.m-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.rich-content :deep(h2) {
  margin: 16px 0 8px;
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.rich-content :deep(h2:first-child) {
  margin-top: 0;
}

.rich-content :deep(p) {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.rich-content :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-content :deep(img) {
  max-width: 100%;
}
</style>
