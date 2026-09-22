<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Button, Form, FormItem, Input, NoticeBar, Toast } from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
import { fetchRealName, submitRealName } from '@/api/me'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { useConfigStore } from '@/stores/config'

/* 实名核验（P1）：后台启用权威二要素核验并测试联通时展示「实名认证」，否则为「身份信息登记」；
 * 未完成 → 姓名 + 身份证号提交；已完成 → 脱敏展示（修改需联系运营）。
 * v46：校验迁移到 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const configStore = useConfigStore()
const label = computed(() => configStore.realnameLabel)
const isVerifiedMode = computed(() => configStore.realnameMode === 'verified')
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
const formRef = ref<FormInstanceFunctions>()
const canSubmit = computed(() => !submitting.value)
useUnsavedGuard(() => !verified.value && Boolean(form.realName.trim() || form.citizenId.trim()))

const rules: FormRules<typeof form> = {
  realName: [{ required: true, message: '请输入真实姓名' }],
  citizenId: [
    { required: true, message: '请输入正确的身份证号' },
    { validator: (val: string) => !val.trim() || /^\d{17}[\dXx]$/.test(val.trim()), message: '请输入正确的身份证号' },
  ],
}

async function onSubmit() {
  if (submitting.value) return
  submitting.value = true
  try {
    await submitRealName({ realName: form.realName.trim(), citizenId: form.citizenId.trim() })
    Toast(isVerifiedMode.value ? '实名认证已完成' : '身份信息登记已完成')
    await load()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function onRealNameSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) void onSubmit()
}
</script>

<template>
  <div class="page-fade-in m-realname">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />

    <template v-else-if="verified">
      <section class="m-card">
        <div class="sec-head">
          <h2 class="sec-title no-margin">{{ label }}</h2>
          <StateTag kind="realname" :value="isVerifiedMode ? 'verified' : 'registered'" />
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
          <span class="read-label">{{ isVerifiedMode ? '认证时间' : '登记时间' }}</span>
          <span class="read-value">{{ info.verifiedAt }}</span>
        </div>
      </section>
      <p class="tip">
        {{ isVerifiedMode
          ? '实名信息仅用于社区身份核验，如需修改请联系社区运营。'
          : '身份信息仅用于社区身份核验，如需修改请联系社区运营。' }}
      </p>
    </template>

    <template v-else>
      <NoticeBar
        visible
        theme="info"
        :content="isVerifiedMode ? '完成实名认证后可享受完整社区服务（企业合作、空间预约等）。' : '完成身份信息登记后可享受完整社区服务（企业合作、空间预约等）。'"
      />
      <section class="m-card">
        <Form
          ref="formRef"
          class="realname-form"
          :data="form"
          :rules="rules"
          label-align="top"
          scroll-to-first-error="smooth"
          @submit="onRealNameSubmit"
        >
          <FormItem label="真实姓名" name="realName">
            <Input v-model="form.realName" :maxlength="20" placeholder="请输入与证件一致的姓名…" clearable />
          </FormItem>
          <FormItem label="身份证号" name="citizenId">
            <Input v-model="form.citizenId" inputmode="numeric" :maxlength="18" placeholder="请输入 18 位身份证号…" clearable />
          </FormItem>
          <Button class="mobile-sticky-action" theme="primary" size="large" block type="submit" :disabled="!canSubmit" :loading="submitting">
            {{ submitting ? '提交中…' : (isVerifiedMode ? '提交认证' : '提交登记') }}
          </Button>
        </Form>
      </section>
      <p class="tip">
        {{ isVerifiedMode
          ? '信息仅用于身份核验，不会公开展示。提交后将经权威核验（姓名与身份证号一致）后生效。'
          : '信息仅用于身份核验，不会公开展示。提交并通过规则校验后立即生效。' }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.m-realname {
  padding:var(--app-space-8);
  padding-bottom:var(--app-space-12);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom:var(--app-space-6);
}

.sec-title {
  margin:0 0 var(--app-space-6);
  font-size: var(--app-font-subtitle);
}

.sec-title.no-margin {
  margin-bottom:0;
}

/* t-form-item 默认左右布局 + 底部 hairline；本页沿用「标签在上、白卡内联」的既有版式 */
.realname-form :deep(.t-form__item) {
  padding: 0;
  margin: 0 0 var(--app-space-7);
  border-bottom: none;
}

.realname-form :deep(.t-form__label) {
  width: auto;
  padding: 0;
  margin-bottom: var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.realname-form :deep(.t-form__controls) {
  margin: 0;
}

.read-row {
  display: flex;
  gap:var(--app-space-4);
  margin-bottom:var(--app-space-5);
  font-size: var(--app-font-body);
}

.read-row:last-child {
  margin-bottom:0;
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
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
  text-align: center;
}
</style>
