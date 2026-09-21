<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Button, DialogPlugin, Icon, Image, Progress, Tag, Textarea, Toast, Upload } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { acceptMilestone, fetchMyProject, returnMilestone, revokeProjectAttachmentUrls, submitMilestone } from '@/api/projects'
import { uploadFile } from '@/api/uploads'
import { ApiError } from '@/api/http'
import { onImageError } from '@/utils/imageFallback'
import { useAsyncList } from '@/composables/useAsyncList'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import type { Milestone, MyProject } from '@/types'
import { formatLocalDateTime } from '@/utils/format'

/* 项目详情：参与双方 + 进度 + 里程碑交付验收（承接方提交、发起方验收，全部通过自动结项）。 */
const route = useRoute()
const auth = useAuthStore()
const projectId = String(route.params.id)

const { data: project, loading, error, run } = useAsyncList<MyProject>(() => fetchMyProject(projectId))
onMounted(run)
/* 离开页面回收附件 blob URL（避免详情页反复进出累积内存） */
onBeforeUnmount(revokeProjectAttachmentUrls)

const acting = ref(false)
const note = ref('')
const noteFor = ref('')
/* v38：交付证据附件（图片，最多 1 张）与退回原因 */
const evidenceFiles = ref<UploadFile[]>([])
const returnFor = ref('')
const returnReason = ref('')
/* v40：退回原因行内错误 */
const returnError = ref('')
watch(returnReason, () => (returnError.value = ''))

async function requestEvidence(file: UploadFile | UploadFile[]) {
  const target = Array.isArray(file) ? file[0] : file
  const raw = target?.raw as File | undefined
  if (!raw) return { status: 'fail' as const, error: '图片读取失败，请重试', response: {} }
  try {
    const info = await uploadFile(raw, 'milestone')
    return { status: 'success' as const, response: { url: info.url, name: info.name } }
  } catch (e) {
    return { status: 'fail' as const, error: e instanceof ApiError ? e.message : '上传失败，请重试', response: {} }
  }
}

const isInitiator = computed(() => project.value?.role === '需求发起方')
const isFinished = computed(() => !!project.value?.finishedAt)
const initiatorName = computed(() => (isInitiator.value ? auth.name : project.value?.partnerName ?? '—'))
const undertakingName = computed(() => {
  if (!project.value) return '—'
  if (!isInitiator.value) return project.value.enterpriseName ?? auth.name
  return project.value.partnerName ?? '—'
})

function statusOf(m: Milestone): 'todo' | 'submitted' | 'accepted' {
  return m.status ?? (m.done ? 'accepted' : 'todo')
}

function statusLabel(m: Milestone): string {
  const status = statusOf(m)
  return status === 'accepted' ? '已验收' : status === 'submitted' ? '待验收' : '待提交'
}

function statusTheme(m: Milestone): 'success' | 'warning' | 'default' {
  const status = statusOf(m)
  return status === 'accepted' ? 'success' : status === 'submitted' ? 'warning' : 'default'
}

function askSubmit(m: Milestone) {
  noteFor.value = m.id
  note.value = ''
  evidenceFiles.value = []
  returnFor.value = ''
}

async function onSubmitMilestone(m: Milestone) {
  acting.value = true
  try {
    const attachments = evidenceFiles.value
      .filter((file) => file.status === 'success')
      .map((file) => ({ name: String(file.response?.name ?? file.name ?? '交付图片'), url: String(file.response?.url ?? file.url ?? '') }))
      .filter((item) => item.url)
    await submitMilestone(projectId, m.id, note.value.trim(), attachments)
    Toast('已提交，等待发起方验收')
    noteFor.value = ''
    evidenceFiles.value = []
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '提交失败，请稍后重试')
  } finally {
    acting.value = false
  }
}

/* v38：发起方退回里程碑 */
function askReturn(m: Milestone) {
  returnFor.value = m.id
  returnReason.value = ''
}

async function onReturnMilestone(m: Milestone) {
  if (!returnReason.value.trim()) {
    returnError.value = '请填写退回原因'
    Toast(returnError.value)
    return
  }
  acting.value = true
  try {
    await returnMilestone(projectId, m.id, returnReason.value.trim())
    Toast('已退回，等待承接方重新提交')
    returnFor.value = ''
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '退回失败，请稍后重试')
  } finally {
    acting.value = false
  }
}

function askAccept(m: Milestone) {
  DialogPlugin.confirm({
    title: '验收里程碑',
    content: `确认「${m.title}」已达成交付要求？验收通过后不可撤销。`,
    cancelBtn: '取消',
    confirmBtn: '确认验收',
    onConfirm: () => void onAcceptMilestone(m),
  })
}

async function onAcceptMilestone(m: Milestone) {
  acting.value = true
  try {
    await acceptMilestone(projectId, m.id)
    Toast('已验收')
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '验收失败，请稍后重试')
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-project-detail">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="project">
      <section class="m-card">
        <header class="head">
          <h2 class="title">{{ project.name }}</h2>
          <Tag v-if="project.finishedAt" theme="success" variant="light" size="small">已结项</Tag>
          <Tag v-else theme="primary" variant="light" size="small">进行中</Tag>
        </header>
        <div class="meta">
          <span class="role">{{ project.role }}</span>
          <router-link v-if="project.sourceDemandId" class="source" :to="`/demands/${project.sourceDemandId}`">来源需求<Icon aria-hidden="true" name="chevron-right" size="12px" /></router-link>
        </div>
        <div class="participants">
          <p v-if="initiatorName !== '—'"><b>需求发起方：</b>{{ initiatorName }}</p>
          <p v-else><b>需求发起方：</b><span class="unknown">历史项目未记录</span></p>
          <p><b>承接方：</b>{{ undertakingName }}</p>
        </div>
        <Progress class="progress" :percentage="project.progress" />
      </section>

      <section class="m-card">
        <h3 class="sub">里程碑</h3>
        <p v-if="!project.milestones.length" class="hint">暂无里程碑</p>
        <ul v-else class="milestones">
          <li v-for="m in project.milestones" :key="m.id" class="milestone">
            <div class="m-head">
              <span class="m-title">{{ m.title }}</span>
              <Tag :theme="statusTheme(m)" variant="light" size="small">{{ statusLabel(m) }}</Tag>
            </div>
            <p v-if="m.submitNote" class="m-note">交付说明：{{ m.submitNote }}</p>
            <div v-if="m.attachments?.length" class="m-evidence">
              <Image v-for="(file, index) in m.attachments" :key="index" :src="file.url" :alt="file.name" fit="cover" lazy @error="onImageError" />
            </div>
            <p v-if="m.returnReason" class="m-return">退回原因：{{ m.returnReason }}</p>
            <p v-if="m.submittedAt" class="m-time">提交于 {{ formatLocalDateTime(m.submittedAt) }}<template v-if="m.acceptedAt"> · 验收于 {{ formatLocalDateTime(m.acceptedAt) }}</template></p>

            <template v-if="!isFinished">
              <template v-if="!isInitiator && statusOf(m) === 'todo'">
                <Textarea v-if="noteFor === m.id" v-model="note" :autosize="{ minRows: 2, maxRows: 4 }" :maxlength="120" placeholder="交付说明（选填）…" />
                <div v-if="noteFor === m.id" class="m-upload">
                  <span class="m-upload-label">交付证据（选填，1 张图片）</span>
                  <Upload
                    v-model:files="evidenceFiles"
                    theme="grid"
                    accept="image/*"
                    :max="1"
                    :size-limit="{ size: 10, unit: 'MB' }"
                    :request-method="requestEvidence"
                  />
                </div>
                <div class="m-actions">
                  <template v-if="noteFor === m.id">
                    <Button size="small" theme="primary" :disabled="acting" @click="onSubmitMilestone(m)">确认提交</Button>
                    <Button size="small" variant="outline" :disabled="acting" @click="noteFor = ''">取消</Button>
                  </template>
                  <Button v-else size="small" theme="primary" variant="outline" @click="askSubmit(m)">提交完成</Button>
                </div>
              </template>
              <template v-else-if="isInitiator && statusOf(m) === 'submitted'">
                <Textarea v-if="returnFor === m.id" v-model="returnReason" :autosize="{ minRows: 2, maxRows: 4 }" :maxlength="120" placeholder="退回原因（必填）…" />
                <p v-if="returnFor === m.id && returnError" class="field-error">{{ returnError }}</p>
                <div class="m-actions">
                  <template v-if="returnFor === m.id">
                    <Button size="small" theme="danger" variant="outline" :disabled="acting" @click="onReturnMilestone(m)">确认退回</Button>
                    <Button size="small" variant="outline" :disabled="acting" @click="returnFor = ''">取消</Button>
                  </template>
                  <template v-else>
                    <Button size="small" theme="primary" :disabled="acting" @click="askAccept(m)">验收通过</Button>
                    <Button size="small" theme="danger" variant="outline" :disabled="acting" @click="askReturn(m)">退回修改</Button>
                  </template>
                </div>
              </template>
            </template>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-project-detail {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}


.head {
  display: flex;
  align-items: flex-start;
  gap:var(--app-space-4);
}

.title {
  flex: 1;
  margin:0;
  font-size: var(--app-font-title);
  line-height: 1.45;
}

.meta {
  display: flex;
  align-items: center;
  gap:var(--app-space-6);
  margin-top:var(--app-space-5);
  font-size: var(--app-font-caption);
}

.role {
  padding:var(--app-space-1) 7px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.source {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-1);
  min-height: 44px;
  color: var(--td-brand-color);
  text-decoration: none;
  cursor: pointer;
}

.participants {
  margin-top:var(--app-space-6);
  padding-top:var(--app-space-5);
  border-top: 1px dashed var(--td-component-border);
}

.participants p {
  margin:0 0 var(--app-space-3);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.participants p:last-child {
  margin-bottom:0;
}

.participants b {
  color: var(--td-text-color-primary);
  font-weight: 600;
}

.participants .unknown {
  color: var(--td-text-color-placeholder);
}

.progress {
  margin-top:var(--app-space-6);
}

.sub {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-subtitle);
}

.hint {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.milestones {
  margin:0;
  padding:0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.milestone {
  padding:var(--app-space-5);
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-secondarycontainer);
}

.m-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap:var(--app-space-4);
  font-size: var(--app-font-body);
}

.m-title {
  min-width: 0;
}

.m-note,
.m-time {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}

.m-return {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  line-height: 1.6;
  color: var(--td-error-color);
}

.m-evidence {
  display: flex;
  gap:var(--app-space-4);
  margin-top:var(--app-space-4);
}

.m-evidence :deep(.t-image) {
  width: 72px;
  height: 72px;
  overflow: hidden;
  border-radius: var(--td-radius-default);
  border: 1px solid var(--td-component-border);
}

.m-upload {
  margin-top:var(--app-space-4);
}

.m-upload-label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.m-time {
  color: var(--td-text-color-placeholder);
}

.m-actions {
  display: flex;
  justify-content: flex-end;
  gap:var(--app-space-4);
  margin-top:var(--app-space-4);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}
</style>
