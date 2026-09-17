<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Checkbox, Icon, Input, Loading, TabPanel, Tabs, Textarea, Toast, Upload } from 'tdesign-mobile-vue'
import type { UploadFile } from 'tdesign-mobile-vue'
import { addProjectFile, addProjectTask, downloadProjectFile, fetchProjectCollab, sendProjectMessage, toggleProjectTask } from '@/api/projects'
import { uploadFile } from '@/api/uploads'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 项目协作空间：任务清单 / 文件库 / 讨论区（Mock；接入期为项目服务端能力）。 */
const route = useRoute()
const projectId = String(route.params.id)
const activeTab = ref('tasks')
const { data, loading, error, run } = useAsyncList(() => fetchProjectCollab(projectId))
onMounted(run)

const taskInput = ref('')
const fileForm = ref({ name: '', url: '' })
const uploadFiles = ref<UploadFile[]>([])
const messageInput = ref('')
const busy = ref('')

async function submitTask() {
  if (!taskInput.value.trim()) return
  busy.value = 'task'
  try {
    await addProjectTask(projectId, taskInput.value)
    taskInput.value = ''
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '添加失败')
  } finally {
    busy.value = ''
  }
}

async function onToggleTask(id: string) {
  try {
    await toggleProjectTask(projectId, id)
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '更新失败')
  }
}

async function submitFile() {
  if (!fileForm.value.name.trim() || !fileForm.value.url.trim()) {
    Toast('请填写文件名与链接')
    return
  }
  busy.value = 'file'
  try {
    await addProjectFile(projectId, fileForm.value.name, fileForm.value.url)
    fileForm.value = { name: '', url: '' }
    uploadFiles.value = []
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '添加失败')
  } finally {
    busy.value = ''
  }
}

async function submitMessage() {
  if (!messageInput.value.trim()) return
  busy.value = 'msg'
  try {
    await sendProjectMessage(projectId, messageInput.value)
    messageInput.value = ''
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '发送失败')
  } finally {
    busy.value = ''
  }
}

async function requestProjectFile(file: UploadFile | UploadFile[]) {
  const target = Array.isArray(file) ? file[0] : file
  const raw = target?.raw as File | undefined
  if (!raw) return { status: 'fail' as const, error: '文件读取失败', response: {} }
  try {
    const info = await uploadFile(raw, 'project')
    fileForm.value.name = info.name
    fileForm.value.url = info.url
    return { status: 'success' as const, response: info }
  } catch (e) {
    return { status: 'fail' as const, error: e instanceof Error ? e.message : '上传失败', response: {} }
  }
}

async function onDownloadFile(id: string, name: string) {
  try {
    await downloadProjectFile(projectId, id, name)
  } catch (e) {
    Toast(e instanceof Error ? e.message : '下载失败')
  }
}
</script>

<template>
  <div class="page-fade-in collab-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else>
      <Tabs v-model="activeTab" class="top-tabs">
        <TabPanel value="tasks" label="任务">
          <div class="panel">
            <div class="row">
              <Input v-model="taskInput" placeholder="添加协作任务…" :maxlength="40" />
              <Button size="small" theme="primary" :loading="busy === 'task'" @click="submitTask">添加</Button>
            </div>
            <EmptyBlock v-if="!(data?.tasks ?? []).length" text="暂无任务，添加第一条协作任务" />
            <div v-else class="list">
              <Checkbox
                v-for="t in data?.tasks"
                :key="t.id"
                class="m-card task"
                :checked="t.done"
                :borderless="true"
                @change="onToggleTask(t.id)"
              >
                <template #label>
                  <p class="task-title" :class="{ done: t.done }">{{ t.title }}</p>
                </template>
                <template #content>
                  <p class="meta">{{ t.at }}</p>
                </template>
              </Checkbox>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="files" label="文件">
          <div class="panel">
            <div class="file-form m-card">
              <Input v-model="fileForm.name" placeholder="文件名（如：需求说明书 v2）" :maxlength="40" />
              <Upload
                v-model:files="uploadFiles"
                accept="image/*,application/pdf"
                :max="1"
                :size-limit="{ size: 10, unit: 'MB' }"
                :request-method="requestProjectFile"
              />
              <Button size="small" variant="outline" block :loading="busy === 'file'" @click="submitFile">添加文件</Button>
            </div>
            <EmptyBlock v-if="!(data?.files ?? []).length" text="暂无共享文件" />
            <div v-else class="list">
              <article v-for="f in data?.files" :key="f.id" class="m-card file">
                <p class="file-name">{{ f.name }}</p>
                <p class="meta">{{ f.at }}</p>
                <Button class="file-link" variant="text" size="small" @click="onDownloadFile(f.id, f.name)">下载文件<template #suffix><Icon name="chevron-right" size="14px" /></template></Button>
              </article>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="discuss" label="讨论">
          <div class="panel">
            <EmptyBlock v-if="!(data?.messages ?? []).length" text="暂无讨论，发起第一句" />
            <div v-else class="list">
              <article v-for="m in data?.messages" :key="m.id" class="m-card msg" :class="{ mine: m.mine }">
                <p class="msg-name">{{ m.name }}</p>
                <p class="msg-content">{{ m.content }}</p>
                <p class="meta">{{ m.at }}</p>
              </article>
            </div>
            <div class="row">
              <Textarea v-model="messageInput" :autosize="{ minRows: 1, maxRows: 3 }" :maxlength="200" placeholder="参与讨论…" />
              <Button size="small" theme="primary" :loading="busy === 'msg'" @click="submitMessage">发送</Button>
            </div>
          </div>
        </TabPanel>
      </Tabs>
    </template>
  </div>
</template>

<style scoped>
.collab-page {
  padding: 12px 16px 24px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}

.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.row :deep(.t-input),
.row :deep(.t-textarea) {
  flex: 1;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task {
  padding: 12px 16px;
}

.task :deep(.t-checkbox__label) {
  flex: 1;
}

.task-title {
  margin: 0;
  font-size: 14px;
}

.task-title.done {
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}

.meta {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}

.file-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-name {
  margin: 0;
  font-size: 14px;
}

.file-link {
  display: inline-block;
  margin-top: 6px;
  min-height: 32px;
  font-size: 13px;
  color: var(--td-brand-color);
}

.msg-name {
  margin: 0;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}

.msg.mine {
  background: var(--td-brand-color-1);
}

.msg-content {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
</style>
