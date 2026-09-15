<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Textarea, Toast } from 'tdesign-mobile-vue'
import { createShowcaseRequest } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 移动企业名片申请：说明必填；Mock 提交即通过并发布 → 跳企业名片；
 * 企业不存在（404）→ 空态（契约无预查接口，提交时判定） */
const route = useRoute()
const router = useRouter()
const enterpriseId = String(route.params.id)

const note = ref('')
const submitting = ref(false)
const notFound = ref(false)

async function onSubmit() {
  if (!note.value.trim()) {
    Toast('请输入申请说明')
    return
  }
  submitting.value = true
  try {
    await createShowcaseRequest(enterpriseId, note.value.trim())
    Toast('申请已通过，企业名片已发布')
    await router.push(`/enterprises/${enterpriseId}`)
  } catch (e) {
    if (e instanceof ApiError && e.code === 404) {
      notFound.value = true
    } else {
      Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-showcase-apply">
    <template v-if="notFound">
      <EmptyBlock text="企业不存在" />
    </template>
    <template v-else>
      <header class="head">
        <h2 class="page-title">申请发布企业名片</h2>
        <p class="page-desc">填写申请说明，审核通过后企业名片将发布</p>
      </header>

      <div class="m-card form">
        <div class="field">
          <label>申请说明</label>
          <Textarea v-model="note" :autosize="{ minRows: 6, maxRows: 14 }" placeholder="请输入申请说明…" />
        </div>
        <Button theme="primary" size="large" block :loading="submitting" @click="onSubmit">提交申请</Button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.m-showcase-apply {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  padding: 0 2px;
}

.head .page-title {
  margin: 0 0 4px;
  font-size: 18px;
}

.head .page-desc {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
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
</style>
