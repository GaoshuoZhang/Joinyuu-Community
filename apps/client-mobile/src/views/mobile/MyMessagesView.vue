<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Button, Form, FormItem, Input, PullDownRefresh, Textarea, Toast } from 'tdesign-mobile-vue'
import type { FormRules } from 'tdesign-mobile-vue'
import { ApiError } from '@/api/http'
import { createMessage, fetchMyMessages } from '@/api/messages'
import ListSkeleton from '@/components/ListSkeleton.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyMessage } from '@/types'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { REFRESH_LOADING_PROPS } from '@/constants/refresh'

/* 我的留言：向社区留言（主题 + 正文）并查看社区回复。
 * 入口在「我的」页与「社区 > 社区服务」页；回复由后台「用户留言」页发出，同时推送站内信。 */

const form = reactive({ title: '', content: '' })
const submitting = ref(false)

const loading = ref(false)
const loadError = ref('')
const list = ref<MyMessage[]>([])
const refreshing = ref(false)

const total = computed(() => list.value.length)

/* 校验口径与后端一致：主题 2-60 字、正文 5-1000 字（长度上限由 maxlength + indicator 约束）。
 * required 渲染必填星号；trigger 显式设为 blur：提交成功后清空表单不会再触发 change 校验而残留「请输入…」提示；
 * 提交时的校验走 trigger=all，不受此设置影响。 */
const rules: FormRules<typeof form> = {
  title: [
    { required: true, message: '请输入留言主题' },
    { trigger: 'blur', validator: (value: string) => value.trim().length >= 2, message: '请输入 2-60 字的留言主题' },
  ],
  content: [
    { required: true, message: '请输入留言内容' },
    { trigger: 'blur', validator: (value: string) => value.trim().length >= 5, message: '请输入 5-1000 字的留言内容' },
  ],
}

/* 正文最长 1000 字：有输入未提交时离开需确认，避免误触返回丢失整段留言 */
const { markClean } = useUnsavedGuard(() => Boolean(form.title.trim() || form.content.trim()))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const result = await fetchMyMessages()
    list.value = result.list
  } catch (error) {
    loadError.value = error instanceof ApiError ? error.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function onRefresh() {
  refreshing.value = true
  try {
    await load()
  } finally {
    setTimeout(() => {
      refreshing.value = false
    }, 300)
  }
}

async function onSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult !== true) return
  submitting.value = true
  try {
    await createMessage(form.title.trim(), form.content.trim())
    form.title = ''
    form.content = ''
    markClean()
    Toast('留言已提交，社区回复后将通过站内信通知')
    await load()
  } catch (error) {
    Toast(error instanceof ApiError ? error.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <PullDownRefresh class="messages-refresh" :value="refreshing" :loading-props="REFRESH_LOADING_PROPS" @refresh="onRefresh">
    <div class="m-messages page-fade-in">
      <!-- 留言表单：登录用户均可提交（页面路由已要求登录） -->
      <section class="m-card">
        <h2 class="sec-title">给社区留言</h2>
        <p class="sec-desc">咨询、建议或需要协助，都可以在这里留言；工作人员回复后会通过站内信通知你。</p>
        <Form
          class="message-form"
          :data="form"
          :rules="rules"
          label-align="top"
          scroll-to-first-error="smooth"
          @submit="onSubmit"
        >
          <FormItem label="留言主题" name="title">
            <Input v-model="form.title" :maxlength="60" placeholder="用一句话说明留言主题" />
          </FormItem>
          <FormItem label="留言内容" name="content">
            <Textarea
              v-model="form.content"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :maxlength="1000"
              indicator
              placeholder="请补充具体诉求或情况说明…"
            />
          </FormItem>
          <Button theme="primary" block type="submit" :loading="submitting">提交留言</Button>
        </Form>
      </section>

      <!-- 我的留言：含社区回复内容与回复时间 -->
      <section class="history">
        <div class="sec-head">
          <h2>我的留言</h2>
          <span v-if="total" class="list-count">共 {{ formatZhNumber(total) }} 条</span>
        </div>
        <ListSkeleton v-if="loading && !total" />
        <EmptyBlock v-else-if="loadError" :text="loadError" action-text="重试" @action="load" />
        <EmptyBlock v-else-if="!total" text="还没有留言，可在上方提交" />
        <div v-else class="list stagger">
          <article v-for="item in list" :key="item.id" class="m-card msg">
            <div class="msg-head">
              <h3 class="msg-title">{{ item.title }}</h3>
              <StateTag kind="userMessage" :value="item.status" />
            </div>
            <p class="msg-content">{{ item.content }}</p>
            <p class="msg-at">{{ formatLocalDateTime(item.createdAt) }}</p>
            <div v-if="item.replyContent" class="reply">
              <p class="reply-head">社区回复</p>
              <p class="reply-content">{{ item.replyContent }}</p>
              <p class="reply-at">{{ item.repliedBy || '社区管理员' }} · {{ formatLocalDateTime(item.repliedAt ?? '') }}</p>
            </div>
            <p v-else class="pending-tip">社区尚未回复，请耐心等待</p>
          </article>
        </div>
      </section>
    </div>
  </PullDownRefresh>
</template>

<style scoped>
.m-messages {
  padding: var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap: var(--app-space-6);
}

/* 整页下拉刷新：组件根默认 height:100% + overflow:hidden 会裁掉底部内容（同 MeView 口径） */
.messages-refresh {
  height: auto;
  min-height: 100%;
  overflow: visible;
}

.messages-refresh :deep(.t-pull-down-refresh__track) {
  height: auto;
}

.sec-title {
  margin: 0;
  font: var(--app-type-section);
}

.sec-desc {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.message-form {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
  margin-top: var(--app-space-6);
}

/* t-form-item 默认左右布局 + 底部 hairline；沿用「标签在上」的紧凑版式 */
.message-form :deep(.t-form__item) {
  padding: 0;
  margin: 0;
  border-bottom: none;
}

.message-form :deep(.t-form__label) {
  width: auto;
  padding: 0;
  margin-bottom: var(--app-space-3);
  font: var(--app-type-body-sm);
  color: var(--td-text-color-secondary);
}

.message-form :deep(.t-form__controls) {
  margin: 0;
}

.history {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.sec-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.sec-head h2 {
  margin: 0;
  font: var(--app-type-page-title);
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-5);
}

.msg-head {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-4);
}

.msg-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font: var(--app-type-card-title);
}

.msg-content {
  margin: var(--app-space-4) 0 0;
  font: var(--app-type-body-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--td-text-color-primary);
}

.msg-at {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}

.reply {
  margin-top: var(--app-space-5);
  padding: var(--app-space-5) var(--app-space-6);
  border-radius: var(--td-radius-large);
  background: var(--td-brand-color-1);
}

.reply-head {
  margin: 0;
  font: var(--app-type-emphasis-sm);
  color: var(--td-brand-color);
}

.reply-content {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-body-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--td-text-color-primary);
}

.reply-at {
  margin: var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.pending-tip {
  margin: var(--app-space-4) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}
</style>
