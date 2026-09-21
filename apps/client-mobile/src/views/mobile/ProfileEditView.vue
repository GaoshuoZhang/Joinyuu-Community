<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Cell, CellGroup, Input, Radio, RadioGroup, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchMe, fetchRealName, updateMe } from '@/api/me'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import AvatarUploader from '@/components/shared/AvatarUploader.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import {
  NICKNAME_MSG,
  NICKNAME_RESERVED_MSG,
  NICKNAME_TOO_LONG_MSG,
  REQUIRED,
  isNickname,
  isReservedNickname,
  isReservedUsername,
  isUsername,
  USERNAME_MSG,
  USERNAME_RESERVED_MSG,
} from '@/utils/validators'

/* 资料编辑：头像（点头像直接上传替换）/ 用户名 / 昵称 / 性别 / 简介 + 实名认证入口。
 * 邮箱与手机号变更在「账号与安全」通过验证码完成，此处不提供编辑。 */
const router = useRouter()
const auth = useAuthStore()
const form = reactive({ username: '', nickname: '', avatar: '', gender: 'unknown' as 'male' | 'female' | 'unknown', bio: '' })
const submitting = ref(false)

const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify(form))
const { markClean } = useUnsavedGuard(() => loaded.value && formSnapshot.value !== baseline.value)

/* 实名入口（P1）：后端启用并测试联通权威核验时称「实名认证」，否则称「身份信息登记」 */
const configStore = useConfigStore()
const realNameVerified = ref<boolean | null>(null)
const realNameNote = computed(() => {
  if (realNameVerified.value === null) return ''
  const verifiedWord = configStore.realnameMode === 'verified' ? '已认证' : '已登记'
  const unverifiedWord = configStore.realnameMode === 'verified' ? '未认证' : '未登记'
  return realNameVerified.value ? verifiedWord : unverifiedWord
})

const usernameError = computed(() => {
  const value = form.username.trim()
  if (!value) return REQUIRED('用户名')
  if (!isUsername(value)) return USERNAME_MSG
  if (isReservedUsername(value)) return USERNAME_RESERVED_MSG
  return ''
})
const nicknameError = computed(() => {
  const value = form.nickname.trim()
  if (!value) return NICKNAME_MSG
  if (!isNickname(value)) return NICKNAME_TOO_LONG_MSG
  if (isReservedNickname(value)) return NICKNAME_RESERVED_MSG
  return ''
})
const loading = ref(true)
const loadError = ref('')
const loaded = ref(false)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const me = await fetchMe()
    if (!loaded.value) {
      form.username = me.username
      form.nickname = me.nickname
      form.avatar = me.avatar ?? ''
      form.gender = me.gender
      form.bio = me.bio ?? ''
      baseline.value = formSnapshot.value
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
})

async function onSave() {
  const firstError = usernameError.value || nicknameError.value
  if (firstError) {
    Toast(firstError)
    return
  }
  submitting.value = true
  try {
    await updateMe({
      username: form.username.trim(),
      nickname: form.nickname.trim(),
      avatar: form.avatar,
      gender: form.gender,
      bio: form.bio,
    })
    auth.username = form.username.trim()
    auth.name = form.nickname.trim()
    auth.avatar = form.avatar
    Toast('资料已更新')
    baseline.value = formSnapshot.value
    markClean()
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
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="loadError" :text="loadError" action-text="重试" @action="load" />
    <template v-else>
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
        <label>用户名</label>
        <Input v-model="form.username" autocomplete="username" :spell-check="false" :maxlength="20" placeholder="字母开头，4-20 位字母/数字/下划线…" clearable />
        <p class="field-hint">全站唯一，可用于登录；修改后请用新用户名登录。</p>
        <p v-if="usernameError" class="field-error">{{ usernameError }}</p>
      </div>
      <div class="field">
        <label>昵称</label>
        <Input v-model="form.nickname" autocomplete="off" :spell-check="false" :maxlength="20" placeholder="社区展示名…" clearable />
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
      <Button class="mobile-sticky-action" theme="primary" size="large" block :loading="submitting" @click="onSave">
        {{ submitting ? '保存中…' : '保存' }}
      </Button>
    </div>

    <CellGroup theme="card" class="security">
      <Cell :title="configStore.realnameLabel" :note="realNameNote" arrow @click="router.push('/me/realname')" />
    </CellGroup>
    </template>
  </div>
</template>

<style scoped>
.profile-edit {
  padding:var(--app-space-8);
}

.field {
  margin-bottom:var(--app-space-8);
}

.field label,
.field .field-label {
  display: block;
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
  margin-bottom:var(--app-space-3);
}

.genders {
  display: flex;
  gap:var(--app-space-10);
}

.field-hint {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.security {
  margin-top:var(--app-space-6);
}

/* 卡片宽度与 .m-card 对齐（与 MeView 同口径） */
.profile-edit :deep(.t-cell-group--card) {
  margin:0;
  border: 1px solid var(--td-component-border);
}
</style>
