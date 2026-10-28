<script setup lang="ts">
import CommerceBusinessLink from '@/components/CommerceBusinessLink.vue'
import { focusFirstInvalid, useDialogFormProtection } from '@/utils/form'
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryTab, backOrFallback } from '@/utils/navigation'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { ArrowLeftIcon } from 'tdesign-icons-vue-next'
import StatusTag from '@/components/StatusTag.vue'
import ProjectFormDialog from '@/components/ProjectFormDialog.vue'
import ContractAttachments from '@/components/ContractAttachments.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { fetchProject, pauseProject, resumeProject, closeProject, archiveProject, acceptProjectMilestone, returnProjectMilestone } from '@/api/projects'
import { isNotFound } from '@/api/http'
import type { Milestone, Project, ProjectUndertaker } from '@/types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const loadError = ref('')
const project = ref<Project | null>(null)
const tab = useQueryTab('info', ['info', 'milestones', 'contracts'] as const)
/* 已归档条目：隐藏全部写操作，仅保留只读内容 */
const isArchived = computed(() => !!project.value?.deletedAt)

const milestoneTagMap: Record<Milestone['status'], { label: string; theme: 'success' | 'primary' | 'default' }> = {
  accepted: { label: '已验收', theme: 'success' },
  submitted: { label: '待验收', theme: 'primary' },
  returned: { label: '已退回', theme: 'default' },
  todo: { label: '未开始', theme: 'default' },
}

const undertakerTypeMap: Record<ProjectUndertaker['type'], string> = {
  enterprise: '社区企业',
  individual: '个人用户',
  custom: '自定义',
}

/* 需求方身份快照 → 展示标签（立项照搬需求发布方身份；自建项目由表单识别） */
const DEMANDER_IDENTITY_LABELS: Record<string, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
  custom: '自定义',
}
const demanderIdentityLabel = computed(() => {
  const type = project.value?.demanderIdentity?.type
  if (!type) return '—'
  return DEMANDER_IDENTITY_LABELS[type] ?? type
})

/* 承接方卡片跳转：社区企业 → 社区企业详情；合作企业（XE 前缀）→ 合作企业详情；用户 → 用户详情；自定义不跳转 */
function canGoUndertaker(u: ProjectUndertaker): boolean {
  if (u.type === 'custom') return false
  return !!u.id
}

/* 承接方详情路由：自定义（无 ID）返回空串 = 不生成 href、也不可跳转 */
function undertakerPath(u: ProjectUndertaker): string {
  if (!canGoUndertaker(u)) return ''
  if (u.id.startsWith('XE')) return '/external-enterprises/' + u.id
  return u.type === 'enterprise' ? '/enterprises/' + u.id : '/users/' + u.id
}

/* 跳转统一走 router.push：保留 t-link 的 href 只为键盘可达与新标签页语义，
 * 点击时 prevent 阻止原生哈希跳转，避免与 push 重复导航 */
function goPath(path: string) {
  if (path) router.push(path)
}


async function load() {
  loading.value = true
  loadError.value = ''
  try {
    project.value = await fetchProject(route.params.id as string)
  } catch (e) {
    /* 404 = 项目不存在（走空态）；其余错误保留原因并展示重试入口 */
    if (isNotFound(e)) {
      project.value = null
    } else {
      loadError.value = e instanceof Error ? e.message : '项目加载失败'
    }
  } finally {
    loading.value = false
  }
}

/* current：有 submitted 节点取其索引，否则取 accepted 数量（下一待办节点） */
/* 起止日期：项目字段缺省时取固定里程碑「项目立项 / 预期交付」的日期 */
const displayStartDate = computed(() => {
  if (project.value?.startDate) return project.value.startDate
  const first = project.value?.milestones.find((m) => m.name === '项目立项')
  return first?.date || '—'
})
const displayEndDate = computed(() => {
  if (project.value?.endDate) return project.value.endDate
  const last = project.value?.milestones.find((m) => m.name === '预期交付')
  return last?.date || '—'
})

const milestoneCurrent = computed(() => {
  const ms = project.value?.milestones ?? []
  const activeIndex = ms.findIndex((m) => m.status === 'submitted')
  if (activeIndex >= 0) return activeIndex
  return ms.filter((m) => m.status === 'accepted').length
})


const formVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formProject = ref<Project | null>(null)
const acting = ref('')

function openEdit() {
  if (!project.value) return
  formMode.value = 'edit'
  formProject.value = project.value
  formVisible.value = true
}

function openRecreate() {
  if (!project.value) return
  formMode.value = 'create'
  formProject.value = project.value
  formVisible.value = true
}

async function onStatusChange(action: 'pause' | 'resume') {
  if (!project.value) return
  const id = project.value.id
  acting.value = id + ':' + action
  try {
    if (action === 'pause') {
      await pauseProject(id)
      MessagePlugin.success('项目已暂停')
    } else {
      await resumeProject(id)
      MessagePlugin.success('项目已恢复进行中')
    }
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

const closeVisible = ref(false)
const closeSaving = ref(false)
const closeFormRef = ref()
const closeForm = reactive({ reason: '' })
const closeRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写关闭原因', trigger: 'submit' }],
}

function openCloseDialog() {
  closeForm.reason = ''
  closeVisible.value = true
  nextTick(() => closeFormRef.value?.clearValidate())
}

async function onConfirmClose() {
  if (!project.value) return
  const valid = await closeFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(closeFormRef.value)
  closeSaving.value = true
  try {
    await closeProject(project.value.id, closeForm.reason)
    MessagePlugin.success('项目已关闭')
    closeVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    closeSaving.value = false
  }
}

async function onArchive() {
  if (!project.value) return
  const id = project.value.id
  acting.value = id + ':archive'
  try {
    await archiveProject(id)
    MessagePlugin.success('项目已归档')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    acting.value = ''
  }
}

/* 「进度节点」验收 / 驳回：仅「待验收」节点、且项目进行中或已暂停时可操作（与客户端同一套服务端口径） */
const canReviewMilestone = computed(
  () => !isArchived.value && !!project.value && ['running', 'paused'].includes(project.value.status),
)
function isMilestoneActing(m: Milestone, action: 'accept' | 'return') {
  return acting.value === `${m.id}:${action}`
}

const returnVisible = ref(false)
const returnSaving = ref(false)
const returnFormRef = ref()
const returnForm = reactive({ reason: '' })
const returnMilestoneTarget = ref<Milestone | null>(null)
const returnRules: FormProps['rules'] = {
  reason: [{ required: true, message: '请填写驳回原因', trigger: 'submit' }],
}

function openMilestoneReturn(m: Milestone) {
  returnMilestoneTarget.value = m
  returnForm.reason = ''
  returnVisible.value = true
  nextTick(() => returnFormRef.value?.clearValidate())
}

async function onAcceptMilestone(m: Milestone) {
  if (!project.value || acting.value) return
  acting.value = `${m.id}:accept`
  try {
    await acceptProjectMilestone(project.value.id, m.id)
    MessagePlugin.success('里程碑已通过验收')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '验收失败')
  } finally {
    acting.value = ''
  }
}

async function onConfirmMilestoneReturn() {
  if (!project.value || !returnMilestoneTarget.value || returnSaving.value) return
  const valid = await returnFormRef.value.validate()
  if (valid !== true) return focusFirstInvalid(returnFormRef.value)
  returnSaving.value = true
  try {
    await returnProjectMilestone(project.value.id, returnMilestoneTarget.value.id, returnForm.reason)
    MessagePlugin.success('里程碑已驳回，等待承接方重新提交')
    returnVisible.value = false
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '驳回失败')
  } finally {
    returnSaving.value = false
  }
}

onMounted(load)
const { close: closeProjectDialog } = useDialogFormProtection(closeForm, closeVisible, closeSaving)
const { close: closeMilestoneReturnDialog } = useDialogFormProtection(returnForm, returnVisible, returnSaving)
</script>

<template>
  <div class="project-detail page-fade-in">
    <CommerceBusinessLink module="project" />
    <t-button variant="text" theme="default" class="back-btn" @click="backOrFallback(router, '/projects')">
      <template #icon><ArrowLeftIcon /></template>
      返回
    </t-button>

    <t-skeleton
      v-if="loading"
      :row-col="[{ width: '100%', height: '200px' }, { width: '100%', height: '380px' }]"
      animation="gradient"
    />

    <ListErrorState v-else-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <template v-else-if="project">
      <!-- 项目头部 -->
      <div class="page-card head-card">
        <div class="head-top">
          <div class="head-main">
            <h3 class="head-name">{{ project.name }}</h3>
            <span class="head-code">{{ project.code }}</span>
            <StatusTag entity="project" :value="project.status" />
            <t-tag v-if="isArchived" theme="default" variant="light">已归档</t-tag>
          </div>
          <div class="head-actions">
            <template v-if="!isArchived">
              <t-button
                v-if="project.status !== 'finished' && project.status !== 'closed'"
                variant="outline"
                @click="openEdit"
              >
                编辑
              </t-button>
              <template v-if="project.status === 'running'">
                <t-popconfirm content="确认暂停该项目？" @confirm="onStatusChange('pause')">
                  <t-button variant="outline" theme="warning" :loading="acting === project.id + ':pause'">
                    暂停
                  </t-button>
                </t-popconfirm>
              </template>
              <template v-else-if="project.status === 'paused'">
                <t-button
                  variant="outline"
                  theme="primary"
                  :loading="acting === project.id + ':resume'"
                  @click="onStatusChange('resume')"
                >
                  恢复
                </t-button>
                <t-button variant="outline" theme="danger" @click="openCloseDialog">关闭</t-button>
              </template>
              <template v-else-if="project.status === 'closed'">
                <t-button variant="outline" theme="primary" @click="openRecreate">重新新增</t-button>
                <t-popconfirm content="确认归档该项目？归档后可在归档管理中恢复" @confirm="onArchive">
                  <t-button variant="outline" theme="warning" :loading="acting === project.id + ':archive'">
                    归档
                  </t-button>
                </t-popconfirm>
              </template>
              <t-popconfirm
                v-else-if="project.status === 'finished'"
                content="确认归档该项目？归档后可在归档管理中恢复"
                @confirm="onArchive"
              >
                <t-button variant="outline" theme="warning" :loading="acting === project.id + ':archive'">
                  归档
                </t-button>
              </t-popconfirm>
            </template>
          </div>
        </div>
        <t-descriptions :column="2" bordered>
          <t-descriptions-item label="立项日期">{{ project.initiatedAt }}</t-descriptions-item>
          <t-descriptions-item label="开始日期">{{ displayStartDate }}</t-descriptions-item>
          <t-descriptions-item label="结束日期">{{ displayEndDate }}</t-descriptions-item>
          <t-descriptions-item label="成员数">{{ project.memberCount }} 人</t-descriptions-item>
          <t-descriptions-item label="当前进度">
            <t-progress :percentage="project.progress" />
          </t-descriptions-item>
          <t-descriptions-item label="来源需求">
            <t-link v-if="project.sourceDemandId" theme="primary" hover="color" :href="`#/demands/${project.sourceDemandId}`" @click.prevent="goPath(`/demands/${project.sourceDemandId}`)">
              {{ project.sourceDemandId }} · 详情
            </t-link>
            <span v-else class="muted">社区自建</span>
          </t-descriptions-item>
          <t-descriptions-item label="需求方">{{ project.demanderName || '—' }}</t-descriptions-item>
          <t-descriptions-item label="需求方身份">{{ demanderIdentityLabel }}</t-descriptions-item>
          <t-descriptions-item label="创建人">{{ project.creatorName || '—' }}</t-descriptions-item>
          <t-descriptions-item label="合同价格">{{ project.contractPrice || '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系人">{{ project.contactName || '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系电话">{{ project.contactPhone || '—' }}</t-descriptions-item>
          <t-descriptions-item label="联系邮箱">{{ project.contactEmail || '—' }}</t-descriptions-item>
        </t-descriptions>
      </div>

      <div class="page-card">
        <t-tabs v-model="tab">
          <!-- 项目信息 -->
          <t-tab-panel value="info" label="项目信息">
            <div class="tab-body">
              <div class="block">
                <h4 class="block-title">承接方与占比</h4>
                <div class="undertaker-list">
                  <t-link theme="default" hover="color" :href="undertakerPath(u) ? '#' + undertakerPath(u) : undefined" :disabled="!canGoUndertaker(u)"
                    v-for="u in project.undertakers"
                    :key="u.id + u.type"
                    class="undertaker-row"
                    :class="{ clickable: canGoUndertaker(u) }"
                    @click.prevent="goPath(undertakerPath(u))"
                  >
                    <div class="ut-info">
                      <span class="ut-name" :title="u.name">{{ u.name }}<t-tag v-if="u.id" class="id-tag" size="small" variant="light">{{ u.id }}</t-tag></span>
                      <t-tag variant="outline" size="small">{{ undertakerTypeMap[u.type] }}</t-tag>
                    </div>
                    <div class="ut-share">
                      <t-progress :percentage="u.share" class="ut-bar" />
                      <span class="ut-num">{{ u.share }}%</span>
                    </div>
                  </t-link>
                </div>
              </div>

              <div class="block">
                <h4 class="block-title">项目说明</h4>
                <div class="desc rich-text" v-html="project.description"></div>
              </div>
            </div>
          </t-tab-panel>

          <!-- 进度节点 -->
          <t-tab-panel value="milestones" label="进度节点">
            <div class="tab-body">
              <t-steps :current="milestoneCurrent">
                <t-step-item
                  v-for="m in project.milestones"
                  :key="m.id"
                  :title="m.name"
                  :content="m.date"
                />
              </t-steps>
              <div class="milestone-list">
                <div v-for="m in project.milestones" :key="m.id" class="milestone-item">
                  <div class="ms-main">
                    <span class="ms-name">{{ m.name }}</span>
                    <t-tag variant="light" :theme="milestoneTagMap[m.status].theme">
                      {{ milestoneTagMap[m.status].label }}
                    </t-tag>
                  </div>
                  <div class="ms-side">
                    <div v-if="m.owners?.length" class="ms-owners">
                      <t-tag v-for="owner in m.owners" :key="owner" variant="light" size="small">
                        {{ owner }}
                      </t-tag>
                    </div>
                    <div v-else-if="project.undertakers?.length" class="ms-owners">
                      <!-- owners 为空 = 全部承接方：按承接方逐一出标签，与显式责任方视觉一致 -->
                      <t-tag v-for="ut in project.undertakers" :key="ut.id + ut.type" variant="light" size="small">
                        {{ ut.name }}<template v-if="ut.id"> [{{ ut.id }}]</template>
                      </t-tag>
                    </div>
                    <span v-else class="ms-none">负责方待定</span>
                    <span class="ms-date">{{ m.date }}</span>
                    <!-- 待验收节点：后台可直接通过验收 / 驳回（与客户端「我发起的」验收同一套服务端口径） -->
                    <div v-if="m.status === 'submitted' && canReviewMilestone" class="ms-actions">
                      <t-popconfirm content="确认通过该节点的验收？通过后不可撤销" @confirm="onAcceptMilestone(m)">
                        <t-button size="small" theme="primary" :loading="isMilestoneActing(m, 'accept')">
                          通过验收
                        </t-button>
                      </t-popconfirm>
                      <t-button
                        size="small"
                        variant="outline"
                        theme="danger"
                        :disabled="!!acting"
                        @click="openMilestoneReturn(m)"
                      >
                        驳回
                      </t-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </t-tab-panel>

          <!-- 项目合同：线下签约合同的照片/PDF 扫描件（复用素材库存储，与租赁详情合同选项卡同款面板） -->
          <t-tab-panel value="contracts" label="项目合同">
            <ContractAttachments :entity-id="project.id" resource="project" :archived="isArchived" />
          </t-tab-panel>
        </t-tabs>
      </div>

      <ProjectFormDialog
        v-model:visible="formVisible"
        :mode="formMode"
        :demand="null"
        :project="formProject"
        @success="load"
      />

      <t-dialog
        :visible="closeVisible"
        :header="project ? `关闭项目 · ${project.name}` : '关闭项目'"
        width="460px"
        @close="closeProjectDialog"
      >
        <template #footer>
          <div class="dialog-footer">
            <t-button variant="text" theme="default" @click="closeProjectDialog">取消</t-button>
            <t-button theme="danger" :loading="closeSaving" @click="onConfirmClose">确认关闭</t-button>
          </div>
        </template>
        <t-form ref="closeFormRef" :data="closeForm" :rules="closeRules" label-align="top">
          <t-form-item label="关闭原因" name="reason">
            <t-textarea
              v-accessible-field
              v-model="closeForm.reason"
              :autosize="{ minRows: 3, maxRows: 5 }"
              placeholder="请填写关闭原因（必填），将记录在项目信息中…"
            />
          </t-form-item>
        </t-form>
      </t-dialog>

      <!-- 进度节点驳回：原因必填（记录在里程碑上，承接方据此重新提交） -->
      <t-dialog
        :visible="returnVisible"
        :header="returnMilestoneTarget ? `驳回节点 · ${returnMilestoneTarget.name}` : '驳回节点'"
        width="460px"
        @close="closeMilestoneReturnDialog"
      >
        <template #footer>
          <div class="dialog-footer">
            <t-button variant="text" theme="default" @click="closeMilestoneReturnDialog">取消</t-button>
            <t-button theme="danger" :loading="returnSaving" @click="onConfirmMilestoneReturn">确认驳回</t-button>
          </div>
        </template>
        <t-form ref="returnFormRef" :data="returnForm" :rules="returnRules" label-align="top">
          <t-form-item label="驳回原因" name="reason">
            <t-textarea
              v-accessible-field
              v-model="returnForm.reason"
              :autosize="{ minRows: 3, maxRows: 5 }"
              placeholder="请填写驳回原因（必填），承接方可据此重新提交…"
            />
          </t-form-item>
        </t-form>
      </t-dialog>
    </template>

    <t-empty v-else description="项目不存在或已被删除" />
  </div>
</template>

<style scoped>
.back-btn {
  margin-bottom: 12px;
}

.head-card {
  margin-bottom: 16px;
}

.head-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 窄屏：操作区整行落到左侧信息块下方，不把标题挤成逐字竖排（同 .page-header） */
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.head-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  flex: 1 1 auto;
  min-width: 240px;
  gap: 12px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  /* 换行后仍贴右（同 .page-header-actions） */
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-left: auto;
}

.head-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  color: var(--td-text-color-primary);
}

.head-code {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.muted {
  color: var(--td-text-color-secondary);
}

.tab-body {
  padding-top: 16px;
}

.block {
  margin-bottom: 24px;
}

.block-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.undertaker-list {
  display: grid;
  gap: 8px;
}

.undertaker-row.clickable {
  cursor: pointer;
}

.undertaker-row.clickable:hover {
  background: var(--td-bg-color-container-hover);
}

.undertaker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 10px 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.ut-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ut-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ut-share {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  max-width: 420px;
}

.ut-bar {
  flex: 1;
}

.ut-num {
  width: 44px;
  text-align: right;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  font-variant-numeric: tabular-nums;
}

.desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--td-text-color-primary);
}

.milestone-list {
  display: grid;
  gap: 8px;
  margin-top: 24px;
}

.milestone-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.ms-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ms-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.ms-side {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ms-owners {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ms-none {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.ms-date {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* 待验收节点的行内操作：与右侧信息同组，避免挤占左侧名称 */
.ms-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 窄屏：头部信息与操作区纵向堆叠、操作按钮换行，避免按钮被挤压溢出 */
@media (max-width: 767px) {
  .head-top {
    flex-direction: column;
    align-items: stretch;
  }

  .head-actions {
    flex-wrap: wrap;
  }
}
</style>
