<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Button, Input, NoticeBar, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchRealName, submitRealName } from '@/api/me'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { useConfigStore } from '@/stores/config'

/* 实名核验（P1）：后台启用权威二要素核验并测试联通时展示「实名认证」，否则为「身份信息登记」；
 * 未完成 → 姓名 + 身份证号提交；已完成 → 脱敏展示（修改需联系运营）。 */
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
const canSubmit = computed(() => !submitting.value)
useUnsavedGuard(() => !verified.value && Boolean(form.realName.trim() || form.citizenId.trim()))

const errors = reactive({ realName: '', citizenId: '' })

async function onSubmit() {
  if (submitting.value) return
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
    Toast(isVerifiedMode.value ? '实名认证已完成' : '身份信息登记已完成')
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
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="load" />

    <template v-else-if="verified">
      <section class="m-card">
        <div class="sec-head">
          <h2 class="sec-title no-margin">{{ label }}</h2>
          <Tag size="small" variant="light" theme="success">{{ isVerifiedMode ? '已认证' : '已登记' }}</Tag>
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
        <div class="field">
          <label>真实姓名</label>
          <Input v-model="form.realName" :maxlength="20" placeholder="请输入与证件一致的姓名…" clearable />
          <p v-if="errors.realName" class="field-error">{{ errors.realName }}</p>
        </div>
        <div class="field">
          <label>身份证号</label>
          <Input v-model="form.citizenId" :maxlength="18" placeholder="请输入 18 位身份证号…" clearable />
          <p v-if="errors.citizenId" class="field-error">{{ errors.citizenId }}</p>
        </div>
        <Button class="mobile-sticky-action" theme="primary" size="large" block :disabled="!canSubmit" :loading="submitting" @click="onSubmit">
          {{ submitting ? '提交中…' : (isVerifiedMode ? '提交认证' : '提交登记') }}
        </Button>
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

.field {
  margin-bottom:var(--app-space-7);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
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
