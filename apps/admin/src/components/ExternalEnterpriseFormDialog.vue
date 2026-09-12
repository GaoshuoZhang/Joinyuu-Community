<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid } from '@/utils/form'
import {
  addExternalMember,
  createExternalEnterprise,
  removeExternalMember,
  updateExternalEnterprise,
  type ExternalEnterprisePayload,
} from '@/api/external-enterprises'
import { dictFallback, fetchDictEntries } from '@/api/dicts'
import { fetchUserOptions } from '@/api/users'
import type { ExternalEnterprise } from '@/types'

/* 合作企业新增/编辑弹窗：
 * 新增/编辑均含档案字段（名称/行业/规模/成立时间/简介）；编辑模式可在保存时同步增删关联成员 */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  enterprise: ExternalEnterprise | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()

const industryOptions = ref(dictFallback.industry.map((label) => ({ label, value: label })))

const sizeOptions = [
  { label: '10人以下', value: '10人以下' },
  { label: '10-50人', value: '10-50人' },
  { label: '50-100人', value: '50-100人' },
  { label: '100人以上', value: '100人以上' },
]

/* 关联成员：value=用户 UID，label=昵称 */
const userOptions = ref<{ label: string; value: string }[]>([])
const memberUids = ref<string[]>([])

const form = reactive({
  name: '',
  industry: '',
  size: '',
  foundedAt: '',
  description: '',
})

function resetForm() {
  if (props.mode === 'edit' && props.enterprise) {
    form.name = props.enterprise.name
    form.industry = props.enterprise.industry
    form.size = props.enterprise.size
    form.foundedAt = props.enterprise.foundedAt
    form.description = props.enterprise.description
    memberUids.value = props.enterprise.members.map((m) => m.userId)
  } else {
    form.name = ''
    form.industry = ''
    form.size = ''
    form.foundedAt = ''
    form.description = ''
    memberUids.value = []
  }
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) return
    resetForm()
    if (userOptions.value.length === 0) {
      try {
        userOptions.value = await fetchUserOptions()
      } catch {
        /* 用户选项加载失败：成员选择留空 */
      }
    }
    if (industryOptions.value.length === 0) {
      fetchDictEntries('industry')
        .then((entries) => {
          const labels = entries.filter((e) => e.status === 'enabled').map((e) => ({ label: e.label, value: e.label }))
          if (labels.length) industryOptions.value = labels
        })
        .catch(() => {
          /* 字典加载失败保留回退词表 */
        })
    }
    nextTick(() => formRef.value?.clearValidate())
  },
)

/* 规则 trigger 一律 submit */
const rules: FormProps['rules'] = {
  name: [{ required: true, message: '请输入企业名称', trigger: 'submit' }],
  industry: [{ required: true, message: '请选择行业', trigger: 'submit' }],
}

function payload(): ExternalEnterprisePayload {
  return {
    name: form.name.trim(),
    industry: form.industry,
    size: form.size || undefined,
    foundedAt: form.foundedAt || undefined,
    description: form.description.trim() || undefined,
  }
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  submitting.value = true
  try {
    if (props.mode === 'create') {
      /* 新增：仅档案字段；成员在新增成功后由详情页或后续编辑维护 */
      const res = await createExternalEnterprise(payload())
      MessagePlugin.success(`合作企业已新增（${res.id}）`)
    } else if (props.enterprise) {
      const enterpriseId = props.enterprise.id
      /* 基线在发起请求前固定，避免保存期间 props 刷新导致差异计算错误 */
      const oldUids = new Set(props.enterprise.members.map((m) => m.userId))
      await updateExternalEnterprise(enterpriseId, payload())
      /* 编辑模式同步成员差异：先删除被取消勾选的，再新增新勾选的 */
      const nowUids = new Set(memberUids.value)
      const toRemove = [...oldUids].filter((uid) => !nowUids.has(uid))
      const toAdd = [...nowUids].filter((uid) => !oldUids.has(uid))
      const removed: string[] = []
      const added: string[] = []
      try {
        for (const uid of toRemove) {
          await removeExternalMember(enterpriseId, uid)
          removed.push(uid)
        }
        for (const uid of toAdd) {
          await addExternalMember(enterpriseId, { userId: uid })
          added.push(uid)
        }
      } catch (e) {
        /* 成员同步部分失败：补偿回滚已执行操作，避免半更新 */
        for (const uid of added) await removeExternalMember(enterpriseId, uid).catch(() => undefined)
        for (const uid of removed) await addExternalMember(enterpriseId, { userId: uid }).catch(() => undefined)
        throw e
      }
      MessagePlugin.success('合作企业信息已保存')
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  emit('update:visible', false)
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="mode === 'create' ? '新增合作企业' : '编辑合作企业'"
    width="640px"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'create' ? '确认新增' : '保存修改' }}
        </t-button>
      </div>
    </template>

    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="企业名称" name="name">
        <t-input v-model="form.name" clearable placeholder="请输入企业名称…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="行业" name="industry">
          <t-select v-model="form.industry" :options="industryOptions" clearable filterable placeholder="选择行业…" />
        </t-form-item>
        <t-form-item label="规模" name="size">
          <t-select v-model="form.size" :options="sizeOptions" clearable placeholder="选择规模…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="成立时间" name="foundedAt">
          <t-date-picker v-model="form.foundedAt" valueType="YYYY-MM" clearable style="width: 100%" />
        </t-form-item>
      </div>
      <t-form-item label="企业简介" name="description">
        <t-textarea
          v-model="form.description"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="选填…"
        />
      </t-form-item>
      <t-form-item v-if="mode === 'edit'" label="关联成员">
        <div class="member-box">
          <p class="member-tip">
            关联成员为该企业的 external_enterprise 身份成员，勾选保存后同步身份绑定。
          </p>
          <t-select
            v-model="memberUids"
            :options="userOptions"
            multiple
            clearable
            filterable
            placeholder="选择关联成员（可选多人）…"
          />
        </div>
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.member-box {
  width: 100%;
}

.member-tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
