<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Loading, Button, Input, NoticeBar, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchRealName, submitRealName } from '@/api/me'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 实名认证（[MOCK-ONLY] 缺口 §7.1-18）：未认证 → 姓名 + 身份证号提交；
 * 已认证 → 脱敏展示（真实后端为三要素核验，且修改需联系运营）。 */
const loading = ref(true)
const error = ref('')
const verified = ref(false)
const info = reactive({ realName: '', citizenIdMasked: '', verifiedAt: '' })

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetchRealName()
    verified.value = res.verified
    info.realName = res.realName ?? ''
    info.citizenIdMasked = res.citizenIdMasked ?? ''
    info.verifiedAt = res.verifiedAt ?? ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
onMounted(load)

const form = reactive({ realName: '', citizenId: '' })
const submitting = ref(false)
const canSubmit = computed(() => !!form.realName.trim() && !!form.citizenId.trim() && !submitting.value)

const errors = reactive({ realName: '', citizenId: '' })

async function onSubmit() {
  if (!canSubmit.value) return
  errors.realName = ''
  errors.citizenId = ''
  if (!form.realName.trim()) {
    errors.realName = '请输入真实姓名'
    Toast(errors.realName)
    return
  }
  const citizenId = form.citizenId.trim()
  if (!/^\d{17}[\dXx]$/.test(citizenId)) {
    errors.citizenId = '请输入正确的身份证号'
    Toast(errors.citizenId)
    return
  }
  submitting.value = true
  try {
    await submitRealName({ realName: form.realName.trim(), citizenId })
    Toast('实名认证已通过')
    await load()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-realname">
    <section class="m-card benefits">
      <h3 class="benefits-title">认证权益</h3>
      <ul class="benefits-list">
        <li><b>基础</b>：浏览内容、报名活动、收藏与评论</li>
        <li><b>实名</b>：发布需求、响应需求、投稿、空间预约</li>
        <li><b>企业</b>：企业名片、以企业身份响应与项目管理</li>
      </ul>
    </section>

    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />

    <template v-else-if="verified">
      <section class="m-card">
        <div class="sec-head">
          <h3 class="sec-title no-margin">实名信息</h3>
          <Tag size="small" variant="light" theme="success">已认证</Tag>
        </div>
        <div class="read-row">
          <span class="read-label">真实姓名</span>
          <span class="read-value">{{ info.realName || '—' }}</span>
        </div>
        <div class="read-row">
          <span class="read-label">证件号码</span>
          <span class="read-value">{{ info.citizenIdMasked || '—' }}</span>
        </div>
        <div v-if="info.verifiedAt" class="read-row">
          <span class="read-label">认证时间</span>
          <span class="read-value">{{ info.verifiedAt }}</span>
        </div>
      </section>
      <p class="tip">实名信息仅用于社区身份核验，如需修改请联系社区运营。</p>
    </template>

    <template v-else>
      <NoticeBar
        visible
        theme="info"
        content="完成实名认证后可享受完整社区服务（企业合作、空间预约等）。"
      />
      <section class="m-card">
        <div class="field">
          <label>真实姓名</label>
          <Input v-model="form.realName" :maxlength="20" placeholder="请输入与证件一致的姓名" clearable />
          <p v-if="errors.realName" class="field-error">{{ errors.realName }}</p>
        </div>
        <div class="field">
          <label>身份证号</label>
          <Input v-model="form.citizenId" :maxlength="18" placeholder="请输入 18 位身份证号" clearable />
          <p v-if="errors.citizenId" class="field-error">{{ errors.citizenId }}</p>
        </div>
        <Button theme="primary" size="large" block :disabled="!canSubmit" :loading="submitting" @click="onSubmit">
          {{ submitting ? '提交中…' : '提交认证' }}
        </Button>
      </section>
      <p class="tip">信息仅用于身份核验，不会公开展示（Mock 演示：提交即通过）。</p>
    </template>
  </div>
</template>

<style scoped>
.benefits {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.benefits-title {
  margin: 0;
  font-size: 14px;
}

.benefits-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.m-realname {
  padding: 16px;
  padding-bottom: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.sec-title {
  margin: 0 0 12px;
  font-size: 15px;
}

.sec-title.no-margin {
  margin-bottom: 0;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.read-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
}

.read-row:last-child {
  margin-bottom: 0;
}

.read-label {
  flex-shrink: 0;
  width: 72px;
  color: var(--td-text-color-secondary);
}

.read-value {
  flex: 1;
  min-width: 0;
}

.tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  text-align: center;
}
</style>
