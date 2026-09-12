<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Input, Radio, RadioGroup, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { createApplication } from '@/api/applications'
import { ApiError } from '@/api/http'
import type { ApplicationType, IdentityType } from '@/types'

const route = useRoute()
const router = useRouter()

/* 支持从入驻说明页带类型跳转：/applications/new?type=settle|individual 等 */
function initialType(): ApplicationType {
  const t = String(route.query.type ?? '')
  return (['individual', 'settle', 'cooperation', 'identity'] as const).includes(t as ApplicationType)
    ? (t as ApplicationType)
    : 'individual'
}

const form = reactive({
  type: initialType() as ApplicationType,
  organizationName: '',
  identityType: 'community_individual' as IdentityType,
  note: '',
})
const submitting = ref(false)

const types: { value: ApplicationType; label: string }[] = [
  { value: 'individual', label: '社区个体入驻' },
  { value: 'settle', label: '企业入驻' },
  { value: 'cooperation', label: '企业合作' },
  { value: 'identity', label: '身份绑定' },
]

const needOrg = computed(() => form.type === 'settle' || form.type === 'cooperation')
const needIdentity = computed(() => form.type === 'identity')

async function onSubmit() {
  if (needOrg.value && !form.organizationName.trim()) {
    Toast('请填写企业名称')
    return
  }
  if (needIdentity.value && !form.identityType) {
    Toast('请选择要绑定的身份类型')
    return
  }
  submitting.value = true
  try {
    await createApplication({
      type: form.type,
      organizationName: needOrg.value ? form.organizationName : undefined,
      identityType: needIdentity.value ? form.identityType : undefined,
      note: form.note.trim() || undefined,
    })
    Toast('申请已提交，审核结果将站内信通知')
    router.push('/me/applications')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in apply">
    <div class="field">
      <label>申请类型</label>
      <div class="type-chips">
        <Tag
          v-for="t in types"
          :key="t.value"
          class="chip"
          size="medium"
          :theme="form.type === t.value ? 'primary' : 'default'"
          variant="light"
          @click="form.type = t.value"
        >
          {{ t.label }}
        </Tag>
      </div>
    </div>

    <div v-if="needOrg" class="field">
      <label>企业名称</label>
      <Input v-model="form.organizationName" :maxlength="40" placeholder="与营业执照一致…" />
    </div>

    <div v-if="needIdentity" class="field">
      <label>要绑定的身份</label>
      <RadioGroup v-model="form.identityType" class="id-chips">
        <Radio value="community_individual" label="社区个体" />
        <Radio value="community_enterprise" label="社区企业" />
      </RadioGroup>
    </div>

    <div class="field">
      <label>补充说明（选填）</label>
      <Textarea
        v-model="form.note"
        :autosize="{ minRows: 3, maxRows: 8 }"
        :maxlength="200"
        placeholder="补充材料说明或联系信息…"
      />
    </div>

    <Button theme="primary" size="large" block class="submit" :loading="submitting" @click="onSubmit">
      {{ submitting ? '提交中…' : '提交申请' }}
    </Button>
    <p class="tip">同类型申请审核中不可重复提交；结果将站内信通知。</p>
  </div>
</template>

<style scoped>
.apply {
  padding: 16px;
}

.field {
  margin-bottom: 15px;
}

.field label {
  display: block;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  margin-bottom: 7px;
}

.type-chips {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.id-chips {
  display: flex;
  gap: 16px;
}

.tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
