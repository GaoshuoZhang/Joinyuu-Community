<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import IdentityTags from '@/components/IdentityTags.vue'
import AdjustValueDialog from '@/components/AdjustValueDialog.vue'
import { identityTypeMap, roleLabelMap } from '@/constants/identity'
import { fetchUser } from '@/api/users'
import { fetchExternalEnterprises } from '@/api/external-enterprises'
import { adjustExperience, adjustPoints, fetchExperienceRecords, fetchPointsRecords } from '@/api/ledgers'
import type { ExperienceRecord, PointsRecord, User, UserIdentity, ExternalEnterprise } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const user = ref<User | null>(null)
/** 外部企业档案缓存：external_enterprise 身份经"档案名 + 成员 uid"反查档案 ID */
const externalArchives = ref<ExternalEnterprise[]>([])
const activeTab = ref('identities')

/* 头部身份标签行：个人用户为默认身份，不展示 */
const headerIdentities = computed(() => user.value?.identities.filter((i) => i.type !== 'individual') ?? [])

function identityName(identity: UserIdentity): string {
  if (identity.type === 'community_individual') return '社区个人'
  return identity.enterpriseName ?? '—'
}

/* 个人用户为注册默认身份，身份信息中不单独展示 */
const displayIdentities = computed(() => user.value?.identities.filter((i) => i.type !== 'individual') ?? [])

/* 社区个人身份（至多一个）；经验值选项卡仅对持有该身份的用户展示 */
const communityIndividualIdentity = computed(() =>
  user.value?.identities.find((i) => i.type === 'community_individual'),
)

/* 社区企业身份卡可跳入驻企业详情；外部企业身份卡可跳外部企业详情（档案名 + 成员 uid 反查） */
function externalArchiveId(identity: UserIdentity): string | undefined {
  if (identity.type !== 'external_enterprise') return undefined
  const uid = user.value?.uid
  return externalArchives.value.find(
    (a) => a.name === identity.enterpriseName && a.members.some((m) => m.userId === uid),
  )?.id
}

function canGoEnterprise(identity: UserIdentity): boolean {
  if (identity.type === 'community_enterprise') return !!identity.enterpriseId
  return identity.type === 'external_enterprise' && !!externalArchiveId(identity)
}

function goEnterprise(identity: UserIdentity) {
  if (identity.type === 'community_enterprise' && identity.enterpriseId) {
    router.push(`/enterprises/${identity.enterpriseId}`)
  } else if (identity.type === 'external_enterprise') {
    const archiveId = externalArchiveId(identity)
    if (archiveId) router.push(`/external-enterprises/${archiveId}`)
  }
}

/* 数据概览卡片 → 跳转对应列表并按该用户自动筛选（有数据时可点击）
 * 跳转参数仅携带用户 ID，列表按 ID 过滤，避免同名用户歧义 */
function goDemands() {
  if (!user.value || user.value.stats.demands === 0) return
  router.push({ path: '/demands', query: { publisher: user.value.uid } })
}

function goProjects() {
  if (!user.value || user.value.stats.projects === 0) return
  router.push({ path: '/projects', query: { participant: user.value.uid } })
}

function goEvents() {
  if (!user.value || user.value.stats.events === 0) return
  router.push({ path: '/events', query: { participant: user.value.uid } })
}

/* ---------- 经验值 / 积分流水 ---------- */

const experienceRecords = ref<ExperienceRecord[]>([])
const pointsRecords = ref<PointsRecord[]>([])

const expAdjustVisible = ref(false)
const expAdjusting = ref(false)
const pointsAdjustVisible = ref(false)
const pointsAdjusting = ref(false)

const ledgerColumns = [
  { colKey: 'at', title: '时间', width: 150 },
  { colKey: 'delta', title: '变动', cell: 'delta', width: 90 },
  { colKey: 'balance', title: '余额', width: 90 },
  { colKey: 'reason', title: '事由', ellipsis: true },
  { colKey: 'operator', title: '操作人', width: 100 },
]

async function onAdjustExperience(delta: number, reason: string) {
  if (!user.value) return
  expAdjusting.value = true
  try {
    const res = await adjustExperience('individual', user.value.uid, delta, reason)
    MessagePlugin.success(`已${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 经验值，当前余额 ${res.balance}`)
    expAdjustVisible.value = false
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '调整失败')
  } finally {
    expAdjusting.value = false
  }
}

async function onAdjustPoints(delta: number, reason: string) {
  if (!user.value) return
  pointsAdjusting.value = true
  try {
    const res = await adjustPoints(user.value.uid, delta, reason)
    MessagePlugin.success(`已${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 积分，当前余额 ${res.balance}`)
    pointsAdjustVisible.value = false
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '调整失败')
  } finally {
    pointsAdjusting.value = false
  }
}

async function loadDetail() {
  const id = route.params.id as string
  const [u, archives] = await Promise.all([
    fetchUser(id),
    fetchExternalEnterprises({ page: 1, pageSize: 100 }),
  ])
  user.value = u
  externalArchives.value = archives.list
  if (user.value.identities.some((i) => i.type === 'community_individual')) {
    experienceRecords.value = await fetchExperienceRecords('individual', id)
  }
  pointsRecords.value = await fetchPointsRecords(id)
}

onMounted(async () => {
  try {
    await loadDetail()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '用户加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="user-detail page-fade-in">
    <t-button variant="text" theme="default" class="back-btn" @click="router.back()">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '208px' }, { width: '100%', height: '400px' }]"
      animation="gradient"
    />

    <t-empty v-else-if="!user" description="用户不存在或已被删除" />

    <template v-else>
      <!-- 用户信息头卡片 -->
      <div class="page-card profile-card">
        <div class="profile-head">
          <t-avatar size="56px">{{ user.nickname.slice(0, 1) }}</t-avatar>
          <div class="profile-title">
            <div class="profile-name-row">
              <span class="profile-name">{{ user.nickname }}</span>
              <StatusTag entity="user" :value="user.status" />
            </div>
            <span class="profile-id">UID：{{ user.uid }}</span>
            <IdentityTags v-if="headerIdentities.length" :identities="headerIdentities" />
          </div>
        </div>

        <t-descriptions :column="3" bordered class="profile-desc">
          <t-descriptions-item label="手机号">{{ user.phone }}</t-descriptions-item>
          <t-descriptions-item label="邮箱">{{ user.email }}</t-descriptions-item>
          <t-descriptions-item label="性别">{{ user.gender }}</t-descriptions-item>
          <t-descriptions-item label="实名状态">
            <t-tag v-if="user.realName && user.citizenId" theme="success" variant="light" size="small">已实名</t-tag>
            <t-tag v-else theme="default" variant="light" size="small">未实名</t-tag>
          </t-descriptions-item>
          <t-descriptions-item label="真实姓名">{{ user.realName ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="身份证号">{{ user.citizenId ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="微信绑定">
            {{ user.wechatOpenid ? (user.wechatVerified ? '已绑定 · 已微信实名' : '已绑定 · 未微信实名') : '未绑定' }}
          </t-descriptions-item>
          <t-descriptions-item label="微信 OpenID">{{ user.wechatOpenid ?? '—' }}</t-descriptions-item>
          <t-descriptions-item label="微信 UnionID">{{ user.wechatUnionid ?? '—' }}</t-descriptions-item>
          <t-descriptions-item v-if="user.status === 'frozen'" label="冻结信息" :span="3">
            {{ user.frozenUntil ? `冻结至 ${user.frozenUntil}` : '长期冻结' }} · 原因：{{ user.frozenReason ?? '—' }}
          </t-descriptions-item>
          <t-descriptions-item label="积分（个人用户）">{{ user.points }}</t-descriptions-item>
          <t-descriptions-item label="注册时间">{{ user.registeredAt }}</t-descriptions-item>
          <t-descriptions-item label="最后活跃时间">{{ user.lastActiveAt }}</t-descriptions-item>
        </t-descriptions>

        <p class="profile-bio">{{ user.bio }}</p>
      </div>

      <!-- 身份信息 / 数据概览 / 经验值 / 积分 / 活跃记录 -->
      <div class="page-card">
        <t-tabs v-model="activeTab">
          <t-tab-panel value="identities" label="身份信息">
            <t-empty
              v-if="displayIdentities.length === 0"
              description="该用户仅持有默认的个人用户身份"
            />
            <div v-else class="identity-list">
              <div
                v-for="(identity, i) in displayIdentities"
                :key="i"
                class="identity-card"
                :class="{ clickable: canGoEnterprise(identity) }"
                @click="goEnterprise(identity)"
              >
                <div class="identity-card-head">
                  <span class="identity-name">{{ identityName(identity) }}</span>
                  <div class="identity-card-tags">
                    <t-tag v-if="identity.type === 'community_individual'" variant="light" size="small">
                      {{ identity.level ? `${identity.level} 级` : '社区个人' }}
                    </t-tag>
                    <template v-else>
                      <t-tag variant="outline" size="small">{{ identityTypeMap[identity.type] }}</t-tag>
                      <t-tag v-if="identity.role" variant="light" size="small">
                        {{ roleLabelMap[identity.role] }}
                      </t-tag>
                    </template>
                  </div>
                </div>
                <div class="identity-card-meta">
                  <span>职位/头衔：{{ identity.title }}</span>
                  <span v-if="identity.type !== 'community_individual' && identity.level">
                    经验等级：{{ identity.level }} 级
                  </span>
                  <span v-if="identity.enterpriseId">企业 ID：{{ identity.enterpriseId }}</span>
                </div>
              </div>
            </div>
          </t-tab-panel>

          <t-tab-panel value="stats" label="数据概览">
            <div class="stats-grid stats-grid-3">
              <div
                class="stat-item"
                :class="{ clickable: user.stats.demands > 0 }"
                @click="goDemands"
              >
                <span class="stat-num">{{ user.stats.demands }}</span>
                <span class="stat-label">需求发布</span>
              </div>
              <div
                class="stat-item"
                :class="{ clickable: user.stats.projects > 0 }"
                @click="goProjects"
              >
                <span class="stat-num">{{ user.stats.projects }}</span>
                <span class="stat-label">参与项目</span>
              </div>
              <div
                class="stat-item"
                :class="{ clickable: user.stats.events > 0 }"
                @click="goEvents"
              >
                <span class="stat-num">{{ user.stats.events }}</span>
                <span class="stat-label">活动报名</span>
              </div>
            </div>
          </t-tab-panel>

          <!-- 经验值：仅持有社区个人身份的用户展示 -->
          <t-tab-panel v-if="communityIndividualIdentity" value="experience" label="经验值">
            <div class="tab-body">
              <div class="exp-head">
                <div class="exp-balance">
                  <span class="exp-label">社区个人 · 当前经验值</span>
                  <span class="exp-num">{{ communityIndividualIdentity.experience ?? 0 }}</span>
                  <t-tag v-if="communityIndividualIdentity.level" variant="light" size="small">
                    {{ communityIndividualIdentity.level }} 级
                  </t-tag>
                </div>
                <t-button theme="primary" @click="expAdjustVisible = true">调整经验值</t-button>
              </div>
              <t-table
                row-key="id"
                :data="experienceRecords"
                :columns="ledgerColumns"
                empty="暂无经验值流水"
              >
                <template #delta="{ row }">
                  <span :class="row.delta > 0 ? 'delta-add' : 'delta-sub'">
                    {{ row.delta > 0 ? `+${row.delta}` : row.delta }}
                  </span>
                </template>
              </t-table>
            </div>
          </t-tab-panel>

          <!-- 积分：挂靠个人用户身份，所有用户展示 -->
          <t-tab-panel value="points" label="积分">
            <div class="tab-body">
              <div class="exp-head">
                <div class="exp-balance">
                  <span class="exp-label">当前积分（个人用户）</span>
                  <span class="exp-num">{{ user.points }}</span>
                </div>
                <t-button theme="primary" @click="pointsAdjustVisible = true">调整积分</t-button>
              </div>
              <t-table
                row-key="id"
                :data="pointsRecords"
                :columns="ledgerColumns"
                empty="暂无积分流水"
              >
                <template #delta="{ row }">
                  <span :class="row.delta > 0 ? 'delta-add' : 'delta-sub'">
                    {{ row.delta > 0 ? `+${row.delta}` : row.delta }}
                  </span>
                </template>
              </t-table>
            </div>
          </t-tab-panel>

          <t-tab-panel value="activities" label="活跃记录">
            <t-empty v-if="user.activities.length === 0" description="暂无活跃记录" />
            <t-timeline v-else class="activity-timeline" mode="same">
              <t-timeline-item v-for="(act, i) in user.activities" :key="i">
                <div class="act-content">{{ act.content }}</div>
                <div class="act-time">{{ act.time }}</div>
              </t-timeline-item>
            </t-timeline>
          </t-tab-panel>
        </t-tabs>
      </div>
    </template>

    <!-- 经验值调整（社区个人） -->
    <AdjustValueDialog
      v-model:visible="expAdjustVisible"
      :header="`调整经验值 · ${user?.name ?? ''}`"
      balance-label="当前经验值（社区个人）"
      :balance="communityIndividualIdentity?.experience ?? 0"
      :loading="expAdjusting"
      @submit="onAdjustExperience"
    />

    <!-- 积分调整 -->
    <AdjustValueDialog
      v-model:visible="pointsAdjustVisible"
      :header="`调整积分 · ${user?.name ?? ''}`"
      balance-label="当前积分（个人用户）"
      :balance="user?.points ?? 0"
      :loading="pointsAdjusting"
      @submit="onAdjustPoints"
    />
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.profile-card {
  margin-bottom: 16px;
}

.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.profile-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.profile-name {
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
  color: var(--td-text-color-primary);
}

.profile-id {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.profile-desc {
  margin-bottom: 16px;
}

.profile-bio {
  margin: 0;
  font-size: 13px;
  line-height: 22px;
  color: var(--td-text-color-secondary);
}

.identity-list {
  display: grid;
  gap: 12px;
  padding-top: 8px;
}

.identity-card {
  padding: 12px 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.identity-card.clickable {
  cursor: pointer;
  transition: border-color 120ms ease;
}

.identity-card.clickable:hover {
  border-color: var(--td-brand-color);
}

.identity-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.identity-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.identity-card-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.identity-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.activity-timeline {
  padding-top: 8px;
}

.act-content {
  font-size: 14px;
  line-height: 22px;
  color: var(--td-text-color-primary);
}

.act-time {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}

.tab-body {
  padding-top: 16px;
}

.stats-grid {
  display: grid;
  gap: 16px;
  padding-top: 8px;
}

.stats-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.stat-item.clickable {
  cursor: pointer;
  transition: border-color 120ms ease;
}

.stat-item.clickable:hover {
  border-color: var(--td-brand-color);
}

.stat-num {
  font-size: 24px;
  font-weight: 600;
  line-height: 32px;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.exp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.exp-balance {
  display: flex;
  align-items: center;
  gap: 8px;
}

.exp-label {
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.exp-num {
  font-size: 20px;
  font-weight: 600;
  color: var(--td-brand-color);
  font-variant-numeric: tabular-nums;
}

.delta-add {
  color: var(--td-success-color);
  font-weight: 600;
}

.delta-sub {
  color: var(--td-error-color);
  font-weight: 600;
}
</style>
