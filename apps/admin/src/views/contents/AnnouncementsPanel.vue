<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import RichEditor from '@/components/RichEditor.vue'
import ListErrorState from '@/components/ListErrorState.vue'
import { fetchHomeAnnouncement, saveHomeAnnouncement } from '@/api/announcements'

/* 首页公告：移动端首页搜索栏下方仅展示一条，本页直接编辑该条并控制开启/关闭。 */
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const formRef = ref()
const meta = reactive({ publishedAt: '', updatedAt: '' })

const form = reactive({
  title: '',
  content: '',
  enabled: false,
})

const rules = {
  title: [{ required: true, message: '请输入公告标题', trigger: 'submit' }],
  content: [{ required: true, message: '请输入公告内容', trigger: 'submit' }],
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await fetchHomeAnnouncement()
    form.title = data.title
    form.content = data.content
    form.enabled = data.enabled
    meta.publishedAt = data.publishedAt
    meta.updatedAt = data.updatedAt
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '数据加载失败'
  } finally {
    loading.value = false
  }
}

async function onSave() {
  const valid = await formRef.value?.validate()
  if (valid !== true) {
    MessagePlugin.warning('请完善公告标题与内容')
    return
  }
  saving.value = true
  try {
    await saveHomeAnnouncement({
      title: form.title,
      content: form.content,
      enabled: form.enabled,
    })
    MessagePlugin.success(form.enabled ? '首页公告已保存并开启' : '首页公告已保存（未开启，客户端不显示）')
    await load()
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="home-announcement page-fade-in">
    <PageHeader
      title="首页公告"
      description="移动端首页搜索栏下方仅展示一条公告；关闭后客户端不再显示公告条"
    />

    <ListErrorState v-if="loadError" :message="loadError" :loading="loading" @retry="load" />

    <div v-else class="page-card">
      <t-loading :loading="loading">
        <t-form ref="formRef" :data="form" :rules="rules" label-width="90px">
          <t-form-item label="公告标题" name="title">
            <t-input v-model="form.title" clearable :maxlength="60" placeholder="请输入公告标题…" />
          </t-form-item>
          <t-form-item label="公告内容" name="content">
            <RichEditor v-model="form.content" placeholder="请输入公告内容…" :min-height="240" />
          </t-form-item>
          <t-form-item label="开启公告" name="enabled">
            <div class="switch-row">
              <t-switch v-model="form.enabled" />
              <span class="switch-tip">开启后展示在客户端首页公告条（全局仅一条）；关闭后客户端不显示</span>
            </div>
          </t-form-item>
          <t-form-item>
            <t-button theme="primary" :loading="saving" @click="onSave">保存</t-button>
          </t-form-item>
        </t-form>
      </t-loading>
      <p v-if="meta.publishedAt" class="meta">
        最近发布：{{ meta.publishedAt }}<template v-if="meta.updatedAt"> · 最近编辑：{{ meta.updatedAt }}</template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.switch-tip {
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}

.meta {
  margin: 16px 0 0;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
</style>
