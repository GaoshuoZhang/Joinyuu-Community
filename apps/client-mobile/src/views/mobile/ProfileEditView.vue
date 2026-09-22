<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Button,
  Cell,
  CellGroup,
  Form,
  FormItem,
  Input,
  Radio,
  RadioGroup,
  Textarea,
  Toast,
} from 'tdesign-mobile-vue'
import type { FormInstanceFunctions, FormRules } from 'tdesign-mobile-vue'
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
 * 邮箱与手机号变更在「账号与安全」通过验证码完成，此处不提供编辑。
 * v46：校验迁移到 t-form/rules——错误内联在字段下方，提交失败自动滚动到首个错误字段。 */
const router = useRouter()
const auth = useAuthStore()
const form = reactive({ username: '', nickname: '', avatar: '', gender: 'unknown' as 'male' | 'female' | 'unknown', bio: '' })
const submitting = ref(false)
const formRef = ref<FormInstanceFunctions>()

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

const rules: FormRules<typeof form> = {
  username: [
    { required: true, message: REQUIRED('用户名') },
    { validator: (val: string) => !val.trim() || isUsername(val), message: USERNAME_MSG },
    { validator: (val: string) => !val.trim() || !isReservedUsername(val), message: USERNAME_RESERVED_MSG },
  ],
  nickname: [
    { required: true, message: NICKNAME_MSG },
    { validator: (val: string) => !val.trim() || isNickname(val), message: NICKNAME_TOO_LONG_MSG },
    { validator: (val: string) => !val.trim() || !isReservedNickname(val), message: NICKNAME_RESERVED_MSG },
  ],
}

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

function onSubmit({ validateResult }: { validateResult: unknown }) {
  /* 校验失败：字段级错误已内联展示，scroll-to-first-error 负责滚动定位 */
  if (validateResult === true) void onSave()
}
</script>

<template>
  <div class="page-fade-in profile-edit">
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="loadError" :text="loadError" action-text="重试" @action="load" />
    <template v-else>
    <div class="m-card">
      <Form
        ref="formRef"
        class="profile-form"
        :data="form"
        :rules="rules"
        label-align="top"
        scroll-to-first-error="smooth"
        @submit="onSubmit"
      >
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
        <FormItem label="用户名" name="username" help="全站唯一，可用于登录；修改后请用新用户名登录。">
          <Input v-model="form.username" autocomplete="username" :spell-check="false" :maxlength="20" placeholder="字母开头，4-20 位字母/数字/下划线…" clearable />
        </FormItem>
        <FormItem label="昵称" name="nickname">
          <Input v-model="form.nickname" autocomplete="off" :spell-check="false" :maxlength="20" placeholder="社区展示名…" clearable />
        </FormItem>
        <FormItem label="性别">
          <RadioGroup v-model="form.gender" class="genders">
            <Radio value="unknown" label="保密" />
            <Radio value="male" label="男" />
            <Radio value="female" label="女" />
          </RadioGroup>
        </FormItem>
        <FormItem label="个人简介" name="bio">
          <Textarea
            v-model="form.bio"
            :autosize="{ minRows: 4, maxRows: 10 }"
            :maxlength="200"
            placeholder="介绍一下自己…"
          />
        </FormItem>
        <Button class="mobile-sticky-action" theme="primary" size="large" block type="submit" :loading="submitting">
          {{ submitting ? '保存中…' : '保存' }}
        </Button>
      </Form>
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

.field .field-label {
  display: block;
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
  margin-bottom:var(--app-space-3);
}

/* t-form-item 默认左右布局 + 底部 hairline；本页沿用「标签在上、白卡内联」的既有版式 */
.profile-form :deep(.t-form__item) {
  padding: 0;
  margin: 0 0 var(--app-space-8);
  border-bottom: none;
}

.profile-form :deep(.t-form__label) {
  width: auto;
  padding: 0;
  margin-bottom: var(--app-space-3);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.profile-form :deep(.t-form__controls) {
  margin: 0;
}

.profile-form :deep(.t-form__item-help) {
  margin-top: var(--app-space-3);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.genders {
  display: flex;
  gap:var(--app-space-10);
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
