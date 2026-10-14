<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, CheckboxGroup, DialogPlugin, Input, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchEnterpriseDetail, removeEnterpriseMember, updateEnterpriseMember } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { ApiError } from '@/api/http'
import { ENTERPRISE_PERMISSIONS } from '@/constants/enterprise'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { EnterpriseMemberPermission } from '@/types'

/* 成员管理：原为底部弹窗，内容较多无法上下滑动，v29 改为独立页面。
 * 负责人或持「管理成员 / 分配权限」的成员可进入；职位/手机号需 manage_members，权限分配需 assign_permission。 */
const route = useRoute()
const router = useRouter()
const enterpriseId = String(route.params.id)
const memberKey = String(route.params.memberKey)

const { data, loading, error, run } = useAsyncList(() => fetchEnterpriseDetail(enterpriseId))
onMounted(run)

const isContact = computed(() => data.value?.isContact === true)
const myPermissions = computed<EnterpriseMemberPermission[]>(() => data.value?.myPermissions ?? [])
function can(perm: EnterpriseMemberPermission): boolean {
  return isContact.value || myPermissions.value.includes(perm)
}

const member = computed(() =>
  (data.value?.members ?? []).find((m) => (m.uid ?? m.name) === memberKey),
)
const targetIsContact = computed(() => member.value?.isContact === true)
const canEnter = computed(() => can('manage_members') || can('assign_permission'))
const canSave = computed(() => can('manage_members') || (can('assign_permission') && !targetIsContact.value))

const permissionOptions = ENTERPRISE_PERMISSIONS.map((p) => ({ label: p.label, value: p.value, content: p.desc }))
function permissionLabels(perms?: EnterpriseMemberPermission[]): string {
  if (!perms?.length) return '未分配权限'
  return perms.map((p) => ENTERPRISE_PERMISSIONS.find((x) => x.value === p)?.label ?? p).join('、')
}

const form = reactive({ role: '', phone: '', permissions: [] as EnterpriseMemberPermission[] })
const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify(form))
const { markClean } = useUnsavedGuard(() => filled.value && formSnapshot.value !== baseline.value)
const permissionsModel = computed({
  get: () => form.permissions as (string | number | boolean)[],
  set: (v: (string | number | boolean)[]) => {
    form.permissions = v as EnterpriseMemberPermission[]
  },
})

/* 数据到达后回填表单（仅一次，避免保存后刷新覆盖输入） */
const filled = ref(false)
function fillForm() {
  if (filled.value || !member.value) return
  form.role = member.value.role ?? ''
  form.phone = member.value.phone ?? ''
  form.permissions = [...(member.value.permissions ?? [])]
  baseline.value = formSnapshot.value
  filled.value = true
}
watch(member, fillForm, { immediate: true })

const saving = ref(false)
/* v46：字段级行内错误（职位/手机号），Toast 仅作提交被拦截时的汇总提示 */
const formErrors = reactive({ role: '', phone: '' })
function validate(): string {
  if (!can('manage_members')) return ''
  formErrors.role = form.role.trim() ? '' : '请输入成员职位'
  const phone = form.phone.trim()
  formErrors.phone = phone && !/^1\d{10}$/.test(phone) ? '请输入 11 位手机号' : ''
  return formErrors.role || formErrors.phone
}

async function onSave() {
  if (!member.value) return
  const firstError = validate()
  if (firstError) {
    Toast(firstError)
    return
  }
  const payload: Parameters<typeof updateEnterpriseMember>[1] = {
    memberUid: member.value.uid,
    memberName: member.value.name,
  }
  if (can('manage_members')) {
    payload.role = form.role.trim()
    payload.phone = form.phone.trim()
  }
  if (can('assign_permission') && !targetIsContact.value) {
    payload.permissions = [...form.permissions]
  }
  saving.value = true
  try {
    await updateEnterpriseMember(enterpriseId, payload)
    Toast('成员信息已更新')
    baseline.value = formSnapshot.value
    markClean()
    await router.replace(`/me/enterprises/${enterpriseId}`)
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

function onRemove() {
  if (!member.value) return
  DialogPlugin.confirm({
    title: '移除企业成员',
    content: `确认将 ${member.value.name} 移出「${data.value?.enterpriseName}」？`,
    cancelBtn: '再想想',
    confirmBtn: '确认移除',
    onConfirm: () => {
      void doRemove()
    },
  })
}

async function doRemove() {
  if (!member.value) return
  try {
    await removeEnterpriseMember(enterpriseId, { memberUid: member.value.uid, memberName: member.value.name })
    Toast('成员已移除')
    markClean()
    await router.replace(`/me/enterprises/${enterpriseId}`)
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '移除失败，请稍后重试')
  }
}
</script>

<template>
  <div class="page-fade-in m-member">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data" text="企业不存在" />
    <EmptyBlock v-else-if="!member" text="未找到该企业成员" />
    <EmptyBlock v-else-if="!canEnter" text="你没有管理该成员的权限" />
    <template v-else>
      <section class="m-card head">
        <Avatar shape="round" size="56px" class="avatar">{{ member.name.slice(0, 1) }}</Avatar>
        <div class="info">
          <h2 class="name">{{ member.name }}</h2>
          <p class="meta">{{ [member.role, member.phone].filter(Boolean).join(' · ') || '暂无职位信息' }}</p>
        </div>
        <Tag v-if="member.isContact" size="small" variant="light" theme="primary">负责人</Tag>
        <Tag v-else size="small" variant="light">成员</Tag>
      </section>

      <section class="m-card">
        <h2 class="sec-title">成员信息</h2>
        <template v-if="can('manage_members')">
          <div class="field">
            <label>职位</label>
            <Input v-model="form.role" :maxlength="20" placeholder="如：产品负责人 / 设计总监…" clearable />
            <p v-if="formErrors.role" class="field-error">{{ formErrors.role }}</p>
          </div>
          <div class="field">
            <label>手机号</label>
            <Input v-model="form.phone" type="tel" :maxlength="11" placeholder="请输入 11 位手机号…" clearable />
            <p v-if="formErrors.phone" class="field-error">{{ formErrors.phone }}</p>
          </div>
        </template>
        <template v-else>
          <div class="read-row">
            <span class="read-label">职位</span>
            <span class="read-value">{{ member.role || '—' }}</span>
          </div>
          <div class="read-row">
            <span class="read-label">手机号</span>
            <span class="read-value">{{ member.phone || '—' }}</span>
          </div>
        </template>
      </section>

      <section class="m-card">
        <h2 class="sec-title">成员权限</h2>
        <template v-if="targetIsContact">
          <p class="perm-tip">负责人默认拥有全部权限，无需分配。</p>
        </template>
        <template v-else-if="can('assign_permission')">
          <p class="perm-hint">勾选后该成员可在社区内代替企业执行对应操作。</p>
          <CheckboxGroup v-model:value="permissionsModel" :options="permissionOptions" />
        </template>
        <template v-else>
          <p class="perm-tip">{{ permissionLabels(member.permissions) }}</p>
        </template>
      </section>

      <!-- v52：次要操作与提示必须排在吸底主按钮之前——.mobile-sticky-action 为 position:sticky bottom，
           其后流内元素会在滚动中段被完全盖住（破坏性的「移除成员」曾因此不可达且误触落点是「保存」） -->
      <Button
        v-if="can('manage_members') && !targetIsContact"
        class="remove-btn"
        theme="danger"
        variant="outline"
        size="large"
        block
        @click="onRemove"
      >
        移除成员
      </Button>
      <p v-if="targetIsContact" class="page-tip">负责人本人需先转移负责人后才能退出。</p>

      <!-- v51：主词与其它编辑页统一为「保存」（原「保存修改」中的「修改」冗余） -->
      <Button v-if="canSave" class="mobile-sticky-action" theme="primary" size="large" block :loading="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存' }}
      </Button>
    </template>
  </div>
</template>

<style scoped>
.m-member {
  padding:var(--app-space-8);
  padding-bottom:var(--app-space-12);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.head {
  display: flex;
  align-items: center;
  gap:var(--app-space-6);
}

.avatar {
  flex-shrink: 0;
  font: var(--app-type-display);
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  margin:0 0 var(--app-space-2);
  font: var(--app-type-page-title);
}

.meta {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin:0 0 var(--app-space-6);
  font: var(--app-type-section);
}

.field {
  margin-bottom:var(--app-space-7);
}

.field:last-child {
  margin-bottom:0;
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  /* v46：表单标签与其它编辑页统一为 body 档（原 caption 偏小） */
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.read-row {
  display: flex;
  gap:var(--app-space-4);
  margin-bottom:var(--app-space-5);
  font: var(--app-type-body);
}

.read-row:last-child {
  margin-bottom:0;
}

.read-label {
  flex-shrink: 0;
  width: 64px;
  color: var(--td-text-color-secondary);
}

.read-value {
  flex: 1;
  min-width: 0;
}

.perm-hint {
  margin:0 0 var(--app-space-5);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.perm-tip {
  margin:0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.remove-btn {
  margin-top:var(--app-space-2);
}

.page-tip {
  margin:0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
  text-align: center;
}
</style>
