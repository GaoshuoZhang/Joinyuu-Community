<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Cell, DateTimePicker, Input, Popup, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { createDemand } from '@/api/demands'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useDict } from '@/composables/useDict'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { IdentityType, UserIdentity } from '@/types'

const IDENTITY_NAMES: Record<IdentityType, string> = {
  individual: '个人用户',
  community_individual: '社区个体',
  community_enterprise: '社区企业',
  external_enterprise: '合作企业',
}

const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const { items: categories } = useDict('demand_category')

const demandOpen = ref(true)
const submitting = ref(false)
const showDeadline = ref(false)
const form = reactive<{ title: string; description: string; categoryCode: string; deadline: string; asIdentity: IdentityType | '' }>({
  title: '',
  description: '',
  categoryCode: '',
  deadline: '',
  asIdentity: auth.identities[0]?.type ?? '',
})

function identityLabelOf(i: UserIdentity): string {
  const parts = [IDENTITY_NAMES[i.type]]
  if (i.levelName) parts.push(i.levelName)
  if (i.enterpriseName) parts.push(i.enterpriseName)
  if (i.organizationName) parts.push(i.organizationName)
  return parts.filter(Boolean).join(' · ')
}

onMounted(async () => {
  await config.ensureLoaded()
  demandOpen.value = config.config.demandOpen
})

async function onSubmit() {
  if (!form.title.trim()) {
    Toast('请输入需求标题')
    return
  }
  if (!form.description.trim()) {
    Toast('请输入需求描述')
    return
  }
  if (!form.categoryCode) {
    Toast('请选择需求类别')
    return
  }
  if (!form.deadline) {
    Toast('请选择截止日期')
    return
  }
  if (!form.asIdentity) {
    Toast('请选择发布身份')
    return
  }
  submitting.value = true
  try {
    await createDemand({
      title: form.title.trim(),
      description: form.description.trim(),
      categoryCode: form.categoryCode,
      deadline: form.deadline,
      asIdentity: form.asIdentity,
    })
    Toast('已提交审核')
    await router.push('/me/demands')
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="m-new-demand page-fade-in">
    <div v-if="!demandOpen">
      <EmptyBlock text="需求广场暂未开放" />
      <Button theme="default" variant="outline" block class="back-btn" @click="router.push('/demands')">返回需求广场</Button>
    </div>

    <template v-else>
      <h1 class="title">发布需求</h1>
      <p class="subtitle">提交后进入审核，通过审核后上架需求广场</p>

      <div class="field">
        <label>需求标题</label>
        <Input v-model="form.title" :maxlength="50" placeholder="一句话描述你的需求" clearable />
      </div>

      <div class="field">
        <label>需求描述</label>
        <Textarea
          v-model="form.description"
          :autosize="{ minRows: 4, maxRows: 10 }"
          :maxlength="1000"
          placeholder="补充背景、期望的交付形式与合作方式…"
        />
      </div>

      <div class="field">
        <label>需求类别</label>
        <div class="chips">
          <Tag
            v-for="c in categories"
            :key="c.code"
            :theme="form.categoryCode === c.code ? 'primary' : 'default'"
            variant="light"
            size="medium"
            @click="form.categoryCode = c.code"
          >
            {{ c.label }}
          </Tag>
        </div>
      </div>

      <div class="field">
        <label>截止日期</label>
        <Cell class="date-trigger" :title="form.deadline || '请选择截止日期'" arrow @click="showDeadline = true" />
        <Popup v-model:visible="showDeadline" placement="bottom">
          <DateTimePicker
            v-model="form.deadline"
            mode="date"
            title="选择截止日期"
            @confirm="showDeadline = false"
            @cancel="showDeadline = false"
          />
        </Popup>
      </div>

      <div class="field">
        <label>以哪个身份发布</label>
        <div class="chips">
          <Tag
            v-for="i in auth.identities"
            :key="i.type"
            :theme="form.asIdentity === i.type ? 'primary' : 'default'"
            variant="light"
            size="medium"
            @click="form.asIdentity = i.type"
          >
            {{ identityLabelOf(i) }}
          </Tag>
        </div>
      </div>

      <Button theme="primary" block class="submit-btn" :loading="submitting" @click="onSubmit">提交需求</Button>
    </template>
  </div>
</template>

<style scoped>
.m-new-demand {
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.title {
  margin: 0 0 4px;
  font-size: 18px;
}

.subtitle {
  margin: 0 0 16px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--td-text-color-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.date-trigger {
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.submit-btn {
  margin-top: 8px;
}

.back-btn {
  margin-top: 14px;
  flex-shrink: 0;
}
</style>
