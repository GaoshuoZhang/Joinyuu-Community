<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { useAsyncList } from '@/composables/useAsyncList'
import { createArticle, fetchColumns } from '@/api/contents'
import { ApiError } from '@/api/http'
import type { ArticleColumn } from '@/types'

/* 移动投稿表单：标题/栏目（chips）/正文（实时字数，最少 30 字）；成功后跳我的投稿 */
const MIN_CONTENT = 30
const router = useRouter()

const { data: columnData, run: loadColumns } = useAsyncList<ArticleColumn[]>(fetchColumns)
const form = reactive({ title: '', columnCode: '', content: '' })
const submitting = ref(false)

const columns = computed(() => columnData.value ?? [])
const contentLength = computed(() => form.content.trim().length)
const contentReady = computed(() => contentLength.value >= MIN_CONTENT)

onMounted(loadColumns)

async function onSubmit() {
  if (!form.title.trim()) {
    Toast('请输入文章标题')
    return
  }
  if (!form.columnCode) {
    Toast('请选择栏目')
    return
  }
  if (!contentReady.value) {
    Toast('正文至少 30 字')
    return
  }
  submitting.value = true
  try {
    await createArticle({ title: form.title.trim(), columnCode: form.columnCode, content: form.content })
    Toast('投稿已提交，审核通过后发放积分')
    await router.push('/me/articles')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '投稿失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-new-article">
    <header class="head">
      <h2 class="page-title">投稿</h2>
      <p class="page-desc">提交后进入审核，审核通过后发放积分</p>
    </header>

    <div class="m-card form">
      <div class="field">
        <label>标题</label>
        <Input v-model="form.title" :maxlength="50" placeholder="请输入文章标题…" clearable />
      </div>
      <div class="field">
        <span class="field-label">栏目</span>
        <div class="chips">
          <Tag
            v-for="c in columns"
            :key="c.code"
            class="chip"
            size="medium"
            :theme="form.columnCode === c.code ? 'primary' : 'default'"
            variant="light"
            @click="form.columnCode = c.code"
          >
            {{ c.label }}
          </Tag>
        </div>
      </div>
      <div class="field">
        <label>正文</label>
        <Textarea v-model="form.content" :autosize="{ minRows: 8, maxRows: 18 }" placeholder="请输入正文，按回车分段…" />
        <p class="count" :class="{ ready: contentReady }">
          已输入 {{ contentLength }} 字{{ contentReady ? '，可以提交' : `，至少 ${MIN_CONTENT} 字` }}
        </p>
      </div>
      <div class="field">
        <span class="field-label">配图（选填）</span>
        <div class="img-placeholder" @click="Toast('图片上传将在接入真实接口后开放')">
          <span class="plus">＋</span>
          <span class="hint">图片上传暂未开放（Mock）</span>
        </div>
      </div>

      <Button theme="primary" size="large" block :loading="submitting" @click="onSubmit">提交投稿</Button>
    </div>
  </div>
</template>

<style scoped>
.m-new-article {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  padding: 0 2px;
}

.head .page-title {
  margin: 0 0 4px;
  font-size: 18px;
}

.head .page-desc {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.field {
  margin-bottom: 14px;
}

.field label,
.field .field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.count {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.count.ready {
  color: var(--td-text-color-placeholder);
}

.img-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 84px;
  border: 1px dashed var(--td-component-border);
  border-radius: var(--td-radius-large);
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  cursor: pointer;
}

.img-placeholder .plus {
  font-size: 18px;
}
</style>
