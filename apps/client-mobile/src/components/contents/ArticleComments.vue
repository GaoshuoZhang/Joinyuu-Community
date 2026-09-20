<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Avatar, Button, CheckTag, Tag, Textarea } from 'tdesign-mobile-vue'
import { actionIdentityOptions, identityOptionLabel } from '@/stores/auth'
import type { ArticleComment, UserIdentity } from '@/types'
import { useIncrementalList } from '@/composables/useIncrementalList'
import { formatLocalDateTime, formatZhNumber } from '@/utils/format'

/* 文章评论区：列表（头像 + 昵称 + 发表身份）+ 评论输入（可选发表身份）；本人评论可删除。 */
const props = defineProps<{
  comments: ArticleComment[]
  identities: UserIdentity[]
  userName: string
  modelValue: string
  submitting: boolean
  error?: string
  /** 当前登录用户 uid：用于展示「删除」按钮 */
  currentUid?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [string]
  submit: [identity: UserIdentity | null]
  delete: [comment: ArticleComment]
}>()

const identityOptions = computed(() => actionIdentityOptions(props.identities))
const picked = ref<UserIdentity | null>(identityOptions.value[0] ?? null)
const commentItems = computed(() => props.comments)
const { visibleItems, hasMore, showMore } = useIncrementalList(commentItems)
watch(
  identityOptions,
  (list) => {
    if (!list.some((i) => i.type === picked.value?.type && i.enterpriseId === picked.value?.enterpriseId)) {
      picked.value = list[0] ?? null
    }
  },
  { deep: true },
)

function pick(identity: UserIdentity) {
  picked.value = identity
}
</script>

<template>
  <section class="comments">
    <h3 class="sec-title">评论（{{ formatZhNumber(comments.length) }}）</h3>
    <div v-if="comments.length" class="comment-list">
      <div v-for="item in visibleItems" :key="item.id" class="comment">
        <div class="comment-head">
          <span class="comment-author">
            <Avatar class="comment-avatar" size="24px" :image="item.avatar">{{ item.authorName.slice(0, 1) }}</Avatar>
            <span class="comment-author-name">{{ item.authorName }}</span>
            <Tag v-if="item.identityName" class="comment-identity" size="small" variant="light" theme="primary">{{ item.identityName }}</Tag>
          </span>
          <span class="comment-at">{{ formatLocalDateTime(item.at) }}</span>
        </div>
        <p class="comment-content">{{ item.content }}</p>
        <div v-if="currentUid && item.uid === currentUid" class="comment-ops">
          <Button variant="text" size="extra-small" theme="danger" @click="emit('delete', item)">删除</Button>
        </div>
      </div>
      <Button v-if="hasMore" block variant="outline" @click="showMore">加载更多评论（剩余 {{ formatZhNumber(comments.length - visibleItems.length) }} 条）</Button>
    </div>
    <p v-else class="comment-empty">暂无评论，来说两句</p>
    <Textarea
      :model-value="modelValue"
      class="comment-input"
      :autosize="{ minRows: 1, maxRows: 3 }"
      :maxlength="200"
      placeholder="友善评论，共建社区…"
      @update:model-value="(value: string | number) => emit('update:modelValue', String(value))"
    />
    <div v-if="identityOptions.length" class="identity-field">
      <span class="identity-label">发表身份</span>
      <div class="chips">
        <CheckTag
          v-for="identity in identityOptions"
          :key="`${identity.type}:${identity.enterpriseId ?? ''}`"
          variant="light"
          size="small"
          :checked="picked?.type === identity.type && (identity.type !== 'community_enterprise' || picked?.enterpriseId === identity.enterpriseId)"
          @change="pick(identity)"
        >
          {{ identityOptionLabel(identity, userName) }}
        </CheckTag>
      </div>
    </div>
    <div class="submit-row">
      <p v-if="error" class="field-error">{{ error }}</p>
      <Button theme="primary" size="small" class="comment-submit" :loading="submitting" @click="emit('submit', picked)">发表评论</Button>
    </div>
  </section>
</template>

<style scoped>
.comments {
  display: flex;
  flex-direction: column;
  padding-top: var(--app-space-6);
  border-top: 1px solid var(--td-component-border);
}

.sec-title {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-body);
}

.comment-list {
  display: flex;
  flex-direction: column;
  margin-bottom:var(--app-space-4);
}

.comment {
  padding: var(--app-space-4) 0;
  border-bottom: 1px solid var(--td-component-border);
}

.comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--app-space-4);
}

.comment-author {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-2);
  min-width: 0;
  font-size: var(--app-font-body);
  font-weight: 600;
}

.comment-avatar {
  flex-shrink: 0;
}

.comment-author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-identity {
  flex-shrink: 0;
}

.comment-at {
  flex-shrink: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.comment-content {
  margin:var(--app-space-2) 0 0 calc(24px + var(--app-space-2));
  font-size: var(--app-font-body);
  line-height: 1.6;
  color: var(--td-text-color-secondary);
}

.comment-ops {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--app-space-1);
}

.comment-empty {
  margin:0 0 var(--app-space-4);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.identity-field {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  margin-top: var(--app-space-3);
}

.identity-label {
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.chips {
  display: flex;
  flex: 1;
  gap: var(--app-space-2);
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chips > * {
  flex-shrink: 0;
}

.submit-row {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--app-space-3);
  margin-top:var(--app-space-3);
}

.field-error {
  flex: 1;
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}
</style>
