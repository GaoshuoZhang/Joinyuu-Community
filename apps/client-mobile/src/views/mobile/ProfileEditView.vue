<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Radio, RadioGroup, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchMe, updateMe } from '@/api/me'
import { ApiError } from '@/api/http'
import { REQUIRED } from '@/utils/validators'

const router = useRouter()
const form = reactive({ nickname: '', gender: 'unknown' as 'male' | 'female' | 'unknown', bio: '' })
const submitting = ref(false)

onMounted(async () => {
  const me = await fetchMe()
  form.nickname = me.nickname
  form.gender = me.gender
  form.bio = me.bio ?? ''
})

async function onSave() {
  if (!form.nickname.trim()) {
    Toast(REQUIRED('昵称'))
    return
  }
  submitting.value = true
  try {
    await updateMe({ ...form })
    Toast('资料已更新')
    router.push('/me')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in profile-edit">
    <div class="m-card">
      <div class="field">
        <label>昵称</label>
        <Input v-model="form.nickname" :maxlength="20" placeholder="社区展示名…" clearable />
      </div>
      <div class="field">
        <label>性别</label>
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
  </div>
</template>

<style scoped>
.profile-edit {
  padding: 16px;
}

.field {
  margin-bottom: 15px;
}

.field label {
  display: block;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  margin-bottom: 6px;
}

.genders {
  display: flex;
  gap: 20px;
}
</style>
