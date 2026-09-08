<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { RefreshIcon, SearchIcon } from 'tdesign-icons-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import { userCategoryOptions } from '@/constants/identity'
import { fetchUsers, freezeUser, updateUserStatus, type UserFreezePayload } from '@/api/users'
import type { User } from '@/types'

const router = useRouter()
const loading = ref(true)
const list = ref<User[]>([])
const total = ref(0)
const togglingId = ref('')

const query = reactive({
  page: 1,
  pageSize: 10,
  keyword: '',
  status: '',
  category: '',
  realStatus: '',
})

const statusOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 'active' },
  { label: '已冻结', value: 'frozen' },
]

const realStatusOptions = [
  { label: '全部', value: '' },
  { label: '已实名', value: 'verified' },
  { label: '未实名', value: 'unverified' },
]

const columns = [
  { colKey: 'user', title: '用户', cell: 'user', width: 190 },
  { colKey: 'phone', title: '手机号', width: 125 },
  { colKey: 'identities', title: '关联身份', cell: 'identities', width: 240 },
  { colKey: 'realStatus', title: '实名状态', cell: 'realStatus', width: 95 },
  { colKey: 'points', title: '积分', width: 80 },
  { colKey: 'status', title: '状态', cell: 'status', width: 95 },
  { colKey: 'registeredAt', title: '注册时间', width: 110 },
  { colKey: 'op', title: '操作', cell: 'op', width: 140 },
]

const pagination = computed(() => ({
  current: query.page,
  pageSize: query.pageSize,
  total: total.value,
  showJumper: true,
}))

async function load() {
  loading.value = true
  try {
    const res = await fetchUsers({ ...query })
    list.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function onSearch() {
  query.page = 1
  load()
}

function onReset() {
  query.keyword = ''
  query.status = ''
  query.category = ''
  query.realStatus = ''
  query.page = 1
  load()
}

function onPageChange(p: { current: number; pageSize: number }) {
  query.page = p.current
  query.pageSize = p.pageSize
  load()
}

/* 冻结弹框：需选择冻结期限（日期+时间）或开启"长期"（默认关），并填写冻结原因（必填） */
const freezeVisible = ref(false)
const freezeTarget = ref<User | null>(null)
const freezeForm = reactive({
  permanent: false,
  until: '',
  reason: '',
})
const freezeSaving = ref(false)
const freezeFormRef = ref()

const freezeRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写冻结原因', trigger: 'submit' }],
}

/* 长期开关：开启后清空冻结期限（期限项随之隐藏） */
watch(
  () => freezeForm.permanent,
  (v) => {
    if (v) freezeForm.until = ''
  },
)

function openFreeze(row: User) {
  freezeTarget.value = row
  freezeForm.permanent = false
  freezeForm.until = ''
  freezeForm.reason = ''
  freezeVisible.value = true
  nextTick(() => freezeFormRef.value?.clearValidate())
}

async function onConfirmFreeze() {
  const valid = await freezeFormRef.value.validate()
  if (valid !== true) return
  if (!freezeForm.permanent && !freezeForm.until) {
    MessagePlugin.warning('请选择冻结期限，或开启"长期"开关')
    return
  }
  if (!freezeTarget.value) return
  freezeSaving.value = true
  try {
    const payload: UserFreezePayload = {
      permanent: freezeForm.permanent,
      until: freezeForm.permanent ? undefined : freezeForm.until,
      reason: freezeForm.reason,
    }
    await freezeUser(freezeTarget.value.uid, payload)
    MessagePlugin.success(
      payload.permanent
        ? `已长期冻结账号「${freezeTarget.value.nickname}」`
        : `已冻结账号「${freezeTarget.value.nickname}」至 ${payload.until}`,
    )
    freezeVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '冻结失败')
  } finally {
    freezeSaving.value = false
  }
}

/* 解冻：确认后直接执行并清理冻结信息 */
async function onUnfreeze(row: User) {
  togglingId.value = row.uid
  try {
    await updateUserStatus(row.uid, 'active')
    MessagePlugin.success(`已解冻账号「${row.nickname}」`)
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    togglingId.value = ''
  }
}

/* 个人用户为注册默认身份，列表「关联身份」不展示 */
function otherIdentities(row: User) {
  return row.identities.filter((i) => i.type !== 'individual')
}

/* 实名状态派生：真实姓名与身份证号均填写 = 已实名 */
function isVerified(row: User) {
  return !!row.realName && !!row.citizenId
}

function goDetail(row: User) {
  router.push(`/users/${row.uid}`)
}

onMounted(load)
</script>

<template>
  <div class="user-list page-fade-in">
    <PageHeader title="用户管理" description="社区成员账号与关联身份管理" />

    <div class="page-filter-bar">
      <t-input
        v-model="query.keyword"
        class="filter-keyword"
        placeholder="搜索昵称/UID/手机号"
        clearable
        @enter="onSearch"
      />
      <t-select
        v-model="query.category"
        label="身份"
        :options="userCategoryOptions"
        clearable
        style="width: 150px"
        @change="onSearch"
      />
      <t-select
        v-model="query.status"
        label="状态"
        :options="statusOptions"
        clearable
        style="width: 130px"
        @change="onSearch"
      />
      <t-select
        v-model="query.realStatus"
        label="实名状态"
        :options="realStatusOptions"
        clearable
        style="width: 130px"
        @change="onSearch"
      />
      <t-button theme="primary" variant="outline" @click="onSearch">
        <template #icon><SearchIcon /></template>
        查询
      </t-button>
      <t-button variant="outline" theme="default" @click="onReset">
        <template #icon><RefreshIcon /></template>
        重置
      </t-button>
    </div>

    <div class="page-card">
      <t-table
        row-key="uid"
        table-layout="fixed"
        hover
        resizable
        :data="list"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        empty="暂无符合条件的用户"
        @page-change="onPageChange"
        @row-click="({ row }) => goDetail(row)"
      >
        <template #user="{ row }">
          <div class="user-cell">
            <t-avatar size="36px">{{ row.nickname.slice(0, 1) }}</t-avatar>
            <div class="user-cell-info">
              <span class="user-name">{{ row.nickname }}</span>
              <span class="user-id">{{ row.uid }}</span>
            </div>
          </div>
        </template>

        <template #identities="{ row }">
          <IdentityTags v-if="otherIdentities(row).length" :identities="otherIdentities(row)" />
          <span v-else class="muted-dash">—</span>
        </template>

        <template #realStatus="{ row }">
          <t-tag v-if="isVerified(row)" theme="success" variant="light" size="small">已实名</t-tag>
          <t-tag v-else theme="default" variant="light" size="small">未实名</t-tag>
        </template>

        <template #status="{ row }">
          <t-tooltip
            v-if="row.status === 'frozen' && (row.frozenReason || row.frozenUntil)"
            :content="[row.frozenUntil ? `冻结至 ${row.frozenUntil}` : '长期冻结', row.frozenReason].filter(Boolean).join(' · ')"
          >
            <StatusTag entity="user" :value="row.status" />
          </t-tooltip>
          <StatusTag v-else entity="user" :value="row.status" />
        </template>

        <template #op="{ row }">
          <div class="op-cell" @click.stop>
            <t-button
              v-if="row.status !== 'frozen'"
              variant="text"
              size="small"
              theme="danger"
              @click="openFreeze(row)"
            >
              冻结
            </t-button>
            <t-popconfirm v-else content="确认解冻该账号？解冻后冻结信息将被清除" @confirm="onUnfreeze(row)">
              <t-button variant="text" size="small" theme="primary" :loading="togglingId === row.uid">
                解冻
              </t-button>
            </t-popconfirm>
            <t-button variant="text" size="small" @click="goDetail(row)">详情</t-button>
          </div>
        </template>
      </t-table>
    </div>

    <!-- 冻结弹框：冻结期限（日期+时间）或长期（开关，默认关）+ 冻结原因（必填） -->
    <t-dialog
      :visible="freezeVisible"
      :header="freezeTarget ? `冻结账号 · ${freezeTarget.nickname}` : '冻结账号'"
      width="480px"
      @close="freezeVisible = false"
    >
      <template #footer>
        <div class="dialog-footer">
          <t-button variant="text" theme="default" @click="freezeVisible = false">取消</t-button>
          <t-button theme="danger" :loading="freezeSaving" @click="onConfirmFreeze">确认冻结</t-button>
        </div>
      </template>
      <t-form ref="freezeFormRef" :data="freezeForm" :rules="freezeRules" label-align="top">
        <t-form-item label="冻结原因" name="reason">
          <t-textarea
            v-model="freezeForm.reason"
            :autosize="{ minRows: 3, maxRows: 5 }"
            placeholder="请填写冻结原因（必填），将记录在账号信息中"
          />
        </t-form-item>
        <t-form-item label="长期冻结" name="permanent">
          <div class="freeze-permanent">
            <t-switch v-model="freezeForm.permanent" />
            <span class="freeze-tip">开启后不设解冻时间，需手动解冻</span>
          </div>
        </t-form-item>
        <t-form-item v-if="!freezeForm.permanent" label="冻结期限" name="until">
          <t-date-picker
            v-model="freezeForm.until"
            valueType="YYYY-MM-DD HH:mm"
            enable-time-picker
            clearable
            placeholder="选择冻结截止时间"
            style="width: 100%"
          />
        </t-form-item>
      </t-form>
    </t-dialog>
  </div>
</template>

<style scoped>
.filter-keyword {
  width: 240px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-cell-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.user-id {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.muted-dash {
  color: var(--td-text-color-placeholder);
}

.op-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.freeze-permanent {
  display: flex;
  align-items: center;
  gap: 10px;
}

.freeze-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
</style>
