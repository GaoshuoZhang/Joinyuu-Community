<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Input, Radio, RadioGroup, Textarea, Toast } from 'tdesign-mobile-vue'
import { createApplication, fetchMyApplicationPayload, resubmitApplication } from '@/api/applications'
import { ApiError } from '@/api/http'
import type { IdentityType } from '@/types'

/* 身份绑定申请（/applications/new）：把已有账号绑定到社区个体 / 社区企业身份。
 * 企业合作（企业入驻 / 合作伙伴）与人才登记为独立流程与表单页，见首页入口。
 * v34 支持 ?revise=<申请 id> 修改重提。 */
const router = useRouter()
const route = useRoute()
const reviseId = String(route.query.revise ?? '')
const revising = computed(() => !!reviseId)

const form = reactive({
  identityType: 'community_individual' as IdentityType,
  organizationName: '',
  note: '',
})
const submitting = ref(false)

onMounted(async () => {
  if (!reviseId) return
  try {
    const payload = await fetchMyApplicationPayload(reviseId)
    if (payload.identityType) form.identityType = payload.identityType
    form.organizationName = payload.organizationName ?? ''
    form.note = payload.note ?? ''
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '加载原申请失败')
  }
})

async function onSubmit() {
  if (!form.identityType) {
    Toast('请选择要绑定的身份类型')
    return
  }
  if (form.identityType === 'community_enterprise' && !form.organizationName.trim()) {
    Toast('请填写要绑定的社区企业名称')
    return
  }
  submitting.value = true
  try {
    const payload = {
      type: 'identity' as const,
      identityType: form.identityType,
      organizationName: form.identityType === 'community_enterprise' ? form.organizationName.trim() : undefined,
      note: form.note.trim() || undefined,
    }
    if (revising.value) {
      await resubmitApplication(reviseId, payload)
      Toast('已重新提交审核')
    } else {
      await createApplication(payload)
      Toast('申请已提交，审核结果将站内信通知')
    }
    await router.push('/me/applications')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in apply">
    <header class="head">
      <h1 class="title">{{ revising ? '修改重提 · 身份绑定申请' : '身份绑定申请' }}</h1>
      <p class="subtitle">{{ revising ? '修改后将重新进入审核队列' : '适用于已具备社区个体 / 社区企业资质，需绑定到当前账号的用户' }}</p>
    </header>

      <div class="m-card form">
        <div class="form-note"><span>申请说明</span><p>提交后由社区运营人员审核，结果将通过站内信通知。</p></div>
        <div class="field">
        <span class="field-label">要绑定的身份</span>
        <RadioGroup v-model="form.identityType" class="id-chips">
          <Radio value="community_individual" label="社区个体" />
          <Radio value="community_enterprise" label="社区企业" />
        </RadioGroup>
      </div>

      <div v-if="form.identityType === 'community_enterprise'" class="field">
        <label>社区企业名称</label>
        <Input v-model="form.organizationName" :maxlength="60" placeholder="请填写已入驻社区的企业全称" clearable />
      </div>

      <div class="field">
        <label>补充说明（选填）</label>
        <Textarea
          v-model="form.note"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :maxlength="200"
          placeholder="补充企业名称、历史资质或联系信息…"
        />
      </div>

      <Button theme="primary" size="large" block class="submit" :loading="submitting" @click="onSubmit">
        {{ submitting ? '提交中…' : revising ? '重新提交' : '提交申请' }}
      </Button>
      <p class="tip">同类型申请审核中不可重复提交；企业入驻 / 合作伙伴 / 人才登记请从首页对应入口发起。</p>
    </div>
  </div>
</template>

<style scoped>
.apply {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head .title {
  margin: 0 0 4px;
  font-size: 20px;
}

.head { padding: 4px 2px; }

.head .subtitle {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.field {
  margin-bottom: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--td-component-border);
}

.field:last-of-type { margin-bottom: 14px; padding-bottom: 0; border-bottom: 0; }

.form-note { margin: -2px 0 18px; padding: 12px; border-radius: var(--td-radius-large); background: var(--td-bg-color-secondarycontainer); }
.form-note span { color: var(--td-brand-color); font-size: 12px; font-weight: 600; }.form-note p { margin: 5px 0 0; color: var(--td-text-color-secondary); font-size: 12px; line-height: 1.7; }

.field label,
.field .field-label {
  display: block;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  margin-bottom: 7px;
}

.id-chips {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: var(--td-radius-large);
  background: var(--td-bg-color-secondarycontainer);
}

.tip {
  margin: 16px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-placeholder);
}
</style>
