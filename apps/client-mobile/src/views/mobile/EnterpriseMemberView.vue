<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Avatar, Button, CheckboxGroup, DialogPlugin, Input, Tag, Toast } from 'tdesign-mobile-vue'
import { fetchEnterpriseDetail, removeEnterpriseMember, updateEnterpriseMember } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import { ApiError } from '@/api/http'
import { ENTERPRISE_PERMISSIONS } from '@/constants/enterprise'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { EnterpriseMemberPermission } from '@/types'

/* 成员管理（[MOCK-ONLY]，缺口 §7.1-17）：原为底部弹窗，内容较多无法上下滑动，v29 改为独立页面。
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
  filled.value = true
}
watch(member, fillForm, { immediate: true })

const saving = ref(false)
async function onSave() {
  if (!member.value) return
  const payload: Parameters<typeof updateEnterpriseMember>[1] = {
    memberUid: member.value.uid,
    memberName: member.value.name,
  }
  if (can('manage_members')) {
    if (!form.role.trim()) {
      Toast('请输入成员职位')
      return
    }
    const phone = form.phone.trim()
    if (phone && !/^1\d{10}$/.test(phone)) {
      Toast('请输入正确的手机号')
      return
    }
    payload.role = form.role.trim()
    payload.phone = phone
  }
  if (can('assign_permission') && !targetIsContact.value) {
    payload.permissions = [...form.permissions]
  }
  saving.value = true
  try {
    await updateEnterpriseMember(enterpriseId, payload)
    Toast('成员信息已更新')
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
    await router.replace(`/me/enterprises/${enterpriseId}`)
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '移除失败，请稍后重试')
  }
}
</script>

<template>
  <div class="page-fade-in m-member">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!data" text="企业不存在" />
    <EmptyBlock v-else-if="!member" text="未找到该企业成员" />
    <EmptyBlock v-else-if="!canEnter" text="你没有管理该成员的权限" />
    <template v-else>
      <section class="m-card head">
        <Avatar shape="round" size="56px" class="avatar">{{ member.name.slice(0, 1) }}</Avatar>
        <div class="info">
          <h3 class="name">{{ member.name }}</h3>
          <p class="meta">{{ [member.role, member.phone].filter(Boolean).join(' · ') || '暂无职位信息' }}</p>
        </div>
        <Tag v-if="member.isContact" size="small" variant="light" theme="primary">负责人</Tag>
        <Tag v-else size="small" variant="light">成员</Tag>
      </section>

      <section class="m-card">
        <h3 class="sec-title">成员信息</h3>
        <template v-if="can('manage_members')">
          <div class="field">
            <label>职位</label>
            <Input v-model="form.role" :maxlength="20" placeholder="如：产品负责人 / 设计总监" clearable />
          </div>
          <div class="field">
            <label>手机号</label>
            <Input v-model="form.phone" type="tel" :maxlength="11" placeholder="请输入 11 位手机号" clearable />
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
        <h3 class="sec-title">成员权限</h3>
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

      <Button v-if="canSave" theme="primary" size="large" block :loading="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存修改' }}
      </Button>
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
    </template>
  </div>
</template>

<style scoped>
.m-member {
  padding: 16px;
  padding-bottom: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  flex-shrink: 0;
  font-size: 20px;
  font-weight: 700;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
}

.meta {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin: 0 0 12px;
  font-size: 15px;
}

.field {
  margin-bottom: 14px;
}

.field:last-child {
  margin-bottom: 0;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
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
  width: 64px;
  color: var(--td-text-color-secondary);
}

.read-value {
  flex: 1;
  min-width: 0;
}

.perm-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.perm-tip {
  margin: 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.remove-btn {
  margin-top: 4px;
}

.page-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  text-align: center;
}
</style>
