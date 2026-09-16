<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Loading, Button, Cell, CellGroup, Input, Radio, RadioGroup, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchMe, fetchRealName, updateMe } from '@/api/me'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useDraft } from '@/composables/useDraft'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import AvatarUploader from '@/components/shared/AvatarUploader.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 资料编辑：头像（点头像直接上传替换）/ 昵称 / 性别 / 简介 + 实名认证入口
 * v38：加载失败可重试；填写过程有草稿与离开保护，且不会被晚到的响应覆盖。 */
const router = useRouter()
const auth = useAuthStore()
const form = reactive({ nickname: '', avatar: '', gender: 'unknown' as 'male' | 'female' | 'unknown', bio: '' })
const submitting = ref(false)

const { hasDraft: draftAvailable, savedAt: draftSavedAt, detect: detectDraft, restore: restoreDraft, discard: discardDraft, clear: clearDraft, rebase: rebaseDraft, dirty } = useDraft(
  'profile',
  () => ({ ...form }),
  (value) => Object.assign(form, value),
  { isEmpty: () => !form.nickname.trim() },
)
useUnsavedGuard(() => dirty.value)

/* 实名认证状态（入口 note）：null 表示加载中/未知 */
const realNameVerified = ref<boolean | null>(null)
const realNameNote = computed(() => {
  if (realNameVerified.value === null) return ''
  return realNameVerified.value ? '已认证' : '未认证'
})

const nicknameError = computed(() => (form.nickname.trim() ? '' : '请输入昵称'))
const loading = ref(true)
const loadError = ref('')
const loaded = ref(false)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const me = await fetchMe()
    if (!loaded.value) {
      form.nickname = me.nickname
      form.avatar = me.avatar ?? ''
      form.gender = me.gender
      form.bio = me.bio ?? ''
      rebaseDraft()
    }
    loaded.value = true
    try {
      const rn = await fetchRealName()
      realNameVerified.value = rn.verified
    } catch {
      realNameVerified.value = null
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  detectDraft()
})

async function onSave() {
  if (!form.nickname.trim()) {
    Toast(nicknameError.value)
    return
  }
  submitting.value = true
  try {
    await updateMe({ ...form })
    auth.name = form.nickname.trim()
    auth.avatar = form.avatar
    Toast('资料已更新')
    clearDraft()
    await router.push('/me')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in profile-edit">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="loadError" :text="loadError" action-text="重试" @action="load" />
    <template v-else>
    <div v-if="draftAvailable" class="draft-bar">
      <span>检测到 {{ draftSavedAt }} 的未保存草稿</span>
      <a v-pressable @click="restoreDraft">恢复</a>
      <a v-pressable @click="discardDraft">放弃</a>
    </div>
    <div class="m-card">
      <div class="field">
        <span class="field-label">头像</span>
        <AvatarUploader
          :image="form.avatar"
          :fallback="form.nickname.slice(0, 1) || auth.name.slice(0, 1)"
          size="64px"
          biz-type="avatar"
          @update:image="form.avatar = $event"
        />
      </div>
      <div class="field">
        <label>昵称</label>
        <Input v-model="form.nickname" :maxlength="20" placeholder="社区展示名…" clearable />
        <p v-if="nicknameError" class="field-error">{{ nicknameError }}</p>
      </div>
      <div class="field">
        <span class="field-label">性别</span>
        <RadioGroup v-model="form.gender" class="genders">
          <Radio value="unknown" label="保密" />
          <Radio value="male" label="男" />
          <Radio value="female" label="女" />
        </RadioGroup>
      </div>
      <div class="field">
        <label>个人简介</label>
        <Textarea
          v-model="form.bio"
          :autosize="{ minRows: 4, maxRows: 10 }"
          :maxlength="200"
          placeholder="介绍一下自己…"
        />
      </div>
      <Button theme="primary" size="large" block :loading="submitting" @click="onSave">
        {{ submitting ? '保存中…' : '保存' }}
      </Button>
    </div>

    <CellGroup theme="card" class="security">
      <Cell title="实名认证" :note="realNameNote" arrow @click="router.push('/me/realname')" />
    </CellGroup>
    </template>
  </div>
</template>

<style scoped>
.profile-edit {
  padding: 16px;
}

.draft-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--td-radius-default);
  background: var(--td-warning-color-1, #fff1e9);
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.draft-bar a {
  color: var(--td-brand-color);
  cursor: pointer;
}

.draft-bar a:first-of-type {
  margin-left: auto;
}

.field {
  margin-bottom: 15px;
}

.field label,
.field .field-label {
  display: block;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  margin-bottom: 6px;
}

.genders {
  display: flex;
  gap: 20px;
}

.security {
  margin-top: 12px;
}

/* 卡片宽度与 .m-card 对齐（与 MeView 同口径） */
.profile-edit :deep(.t-cell-group--card) {
  margin: 0;
  border: 1px solid var(--td-component-border);
}
</style>
