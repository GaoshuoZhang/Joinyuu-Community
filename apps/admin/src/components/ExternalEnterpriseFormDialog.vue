<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
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

const industryLoaded = ref(false)
const industryLoadError = ref('')
const industryLoading = ref(false)
const industryOptions = ref(dictFallback.industry.map((label) => ({ label, value: label })))

async function loadIndustryOptions() {
  if (industryLoading.value) return
  industryLoading.value = true
  try {
    const entries = await fetchDictEntries('industry')
    industryOptions.value = entries.filter((entry) => entry.status === 'enabled').map((entry) => ({ label: entry.label, value: entry.label }))
    industryLoaded.value = true
    industryLoadError.value = ''
  } catch {
    industryLoadError.value = '行业字典加载失败，当前显示默认选项。'
  } finally {
    industryLoading.value = false
  }
}

const sizeOptions = [
  { label: '10人以下', value: '10人以下' },
  { label: '10-50人', value: '10-50人' },
  { label: '50-100人', value: '50-100人' },
  { label: '100人以上', value: '100人以上' },
]

/* 关联成员：value=用户 UID，label=昵称 */
const userOptions = ref<{ label: string; value: string }[]>([])
const memberUids = ref<string[]>([])
const memberLoadError = ref('')
const memberLoading = ref(false)

async function loadMemberOptions() {
  if (memberLoading.value) return
  memberLoading.value = true
  try {
    userOptions.value = await fetchUserOptions()
    memberLoadError.value = ''
  } catch {
    memberLoadError.value = '成员选项加载失败，已选成员仍会保留。'
  } finally {
    memberLoading.value = false
  }
}

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

const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(() => ({ ...form, members: memberUids.value }))
usePageDirtyGuard(computed(() => props.visible && isDirty.value))

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    resetForm()
    markBaseline()
    if (userOptions.value.length === 0) void loadMemberOptions()
    if (!industryLoaded.value) void loadIndustryOptions()
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
        const rollback = await Promise.allSettled([
          ...added.map((uid) => removeExternalMember(enterpriseId, uid)),
          ...removed.map((uid) => addExternalMember(enterpriseId, { userId: uid })),
        ])
        emit('success')
        const incomplete = rollback.some((result) => result.status === 'rejected')
        throw new Error(`企业档案已保存；成员同步失败${incomplete ? '且部分回滚失败，请关闭后重新加载核对成员' : '，成员变更已撤回，可重试'}：${e instanceof Error ? e.message : '请求失败'}`)
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
  if (submitting.value) return
  guardClose(() => emit('update:visible', false))
}
</script>

<template>
  <t-dialog
    :close-on-overlay-click="true"
    :visible="visible"
    :header="mode === 'create' ? '新增合作企业' : '编辑合作企业'"
    width="880px"
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

    <t-alert v-if="industryLoadError" theme="warning" :message="industryLoadError" style="margin-bottom: 16px">
      <template #operation><t-button variant="text" :loading="industryLoading" @click="loadIndustryOptions">重新加载行业</t-button></template>
    </t-alert>
    <t-alert v-if="memberLoadError" theme="warning" :message="memberLoadError" style="margin-bottom: 16px">
      <template #operation><t-button variant="text" :loading="memberLoading" @click="loadMemberOptions">重新加载成员</t-button></template>
    </t-alert>
    <t-form ref="formRef" :data="form" :rules="rules" label-align="top">
      <t-form-item label="企业名称" name="name">
        <t-input v-accessible-field v-model="form.name" clearable placeholder="请输入企业名称…" />
      </t-form-item>
      <div class="form-row">
        <t-form-item label="行业" name="industry">
          <t-select v-accessible-field v-model="form.industry" :options="industryOptions" clearable filterable placeholder="选择行业…" />
        </t-form-item>
        <t-form-item label="规模" name="size">
          <t-select v-accessible-field v-model="form.size" :options="sizeOptions" clearable placeholder="选择规模…" />
        </t-form-item>
      </div>
      <div class="form-row">
        <t-form-item label="成立时间" name="foundedAt">
          <t-date-picker v-accessible-field v-model="form.foundedAt" valueType="YYYY-MM" clearable class="ctl-w-full" />
        </t-form-item>
      </div>
      <t-form-item label="企业简介" name="description">
        <t-textarea
          v-accessible-field
          v-model="form.description"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="选填…"
        />
      </t-form-item>
      <t-form-item v-if="mode === 'edit'" label="关联成员">
        <div class="member-box">
          <p class="member-tip">
            关联成员为该企业的 external_enterprise 身份成员，勾选保存后同步成员归属。
          </p>
          <t-select
            v-accessible-field
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

.member-box {
  width: 100%;
}

.member-tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
