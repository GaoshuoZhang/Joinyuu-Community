<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Button, Input, Loading, TabPanel, Tabs, Textarea, Toast } from 'tdesign-mobile-vue'
import { addProjectFile, addProjectTask, fetchProjectCollab, sendProjectMessage, toggleProjectTask } from '@/api/projects'
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
              <article v-for="t in data?.tasks" :key="t.id" class="m-card task" v-pressable @click="onToggleTask(t.id)">
                <span class="check" :class="{ done: t.done }">{{ t.done ? '✓' : '' }}</span>
                <div class="task-main">
                  <p class="task-title" :class="{ done: t.done }">{{ t.title }}</p>
                  <p class="meta">{{ t.at }}</p>
                </div>
              </article>
            </div>
          </div>
        </TabPanel>

        <TabPanel value="files" label="文件">
          <div class="panel">
            <div class="file-form m-card">
              <Input v-model="fileForm.name" placeholder="文件名（如：需求说明书 v2）" :maxlength="40" />
              <Input v-model="fileForm.url" placeholder="文件链接（https://…）" />
              <Button size="small" variant="outline" block :loading="busy === 'file'" @click="submitFile">添加文件</Button>
            </div>
            <EmptyBlock v-if="!(data?.files ?? []).length" text="暂无共享文件" />
            <div v-else class="list">
              <article v-for="f in data?.files" :key="f.id" class="m-card file">
                <p class="file-name">{{ f.name }}</p>
                <p class="meta">{{ f.at }}</p>
                <a class="file-link" :href="f.url" target="_blank" rel="noopener noreferrer">打开链接 ›</a>
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
  display: flex;
  align-items: center;
  gap: 10px;
}

.check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--td-component-border);
  border-radius: 50%;
  color: #fff;
  font-size: 13px;
}

.check.done {
  background: var(--td-success-color);
  border-color: var(--td-success-color);
}

.task-main {
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
