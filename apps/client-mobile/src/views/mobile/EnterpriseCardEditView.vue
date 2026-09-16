<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, Button, Input, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchEnterpriseDetail, updateMyEnterprise } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import { useDraft } from '@/composables/useDraft'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import AvatarUploader from '@/components/shared/AvatarUploader.vue'

/* 编辑企业名片（负责人或获「编辑企业名片」权限的成员，[MOCK-ONLY]，缺口 §7.1-16/17）：
 * Logo / 企业名称 / 行业 / 规模 / 成立时间 / 官网 / 办公地点 / 简介 / 主营业务 / 核心优势；
 * 保存后回到企业详情；v38 增加草稿、离开保护与保存后显式返回（避免深链退出应用）。 */
const route = useRoute()
const router = useRouter()
const enterpriseId = String(route.params.id)

const { data, loading, error, run } = useAsyncList(() => fetchEnterpriseDetail(enterpriseId))
onMounted(async () => {
  await run()
  fillForm()
})

const canEdit = computed(
  () => data.value?.isContact === true || (data.value?.myPermissions ?? []).includes('edit_card'),
)

const SIZE_OPTIONS = ['1-9 人', '10-49 人', '50-99 人', '100 人以上']
const form = reactive({
  logo: '',
  industry: '',
  size: '',
  foundedAt: '',
  website: '',
  address: '',
  description: '',
  services: '',
  advantages: '',
})
const submitting = ref(false)
/* v39：官网协议校验（与后端一致，避免直接渲染为 href） */
const websiteError = computed(() => {
  const url = form.website.trim()
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? '' : '官网需以 http(s):// 开头'
})

/* v38 草稿与离开保护 */
const { hasDraft: draftAvailable, savedAt: draftSavedAt, detect: detectDraft, restore: restoreDraft, discard: discardDraft, clear: clearDraft, rebase: rebaseDraft, dirty } = useDraft(
  `enterprise-card-${enterpriseId}`,
  () => ({ ...form }),
  (value) => Object.assign(form, value),
  {
    enabled: () => canEdit.value && !!data.value,
    isEmpty: () => !form.industry.trim() && !form.description.trim() && !form.size,
  },
)
useUnsavedGuard(() => dirty.value)

function fillForm() {
  const d = data.value
  if (!d) return
  form.logo = d.logo ?? ''
  form.industry = d.industry
  form.size = d.size
  form.foundedAt = d.foundedAt ?? ''
  form.website = d.website ?? ''
  form.address = d.address ?? ''
  form.description = d.description
  form.services = d.services ?? ''
  form.advantages = d.advantages ?? ''
  rebaseDraft()
  detectDraft()
}

async function onSave() {
  if (!form.industry.trim()) {
    Toast('请输入所属行业')
    return
  }
  if (!form.size) {
    Toast('请选择企业规模')
    return
  }
  if (form.description.trim().length < 10) {
    Toast('企业简介至少 10 个字')
    return
  }
  if (websiteError.value) {
    Toast(websiteError.value)
    return
  }
  submitting.value = true
  try {
    await updateMyEnterprise(enterpriseId, {
      logo: form.logo,
      industry: form.industry.trim(),
      size: form.size,
      foundedAt: form.foundedAt.trim() || undefined,
      website: form.website.trim() || undefined,
      address: form.address.trim() || undefined,
      description: form.description.trim(),
      services: form.services.trim() || undefined,
      advantages: form.advantages.trim() || undefined,
    })
    Toast('企业名片已保存')
    clearDraft()
    await router.replace(`/me/enterprises/${enterpriseId}`)
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-card-edit">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!canEdit" text="仅企业负责人或获授权成员可编辑企业名片" />
    <template v-else-if="data">
      <div v-if="draftAvailable" class="draft-bar">
        <span>检测到 {{ draftSavedAt }} 的未保存草稿</span>
        <a v-pressable @click="restoreDraft">恢复</a>
        <a v-pressable @click="discardDraft">放弃</a>
      </div>
      <section class="m-card">
        <div class="field">
          <span class="field-label">企业 Logo</span>
          <AvatarUploader
            :image="form.logo"
            :fallback="data.enterpriseName.slice(0, 1)"
            size="64px"
            shape="round"
            biz-type="enterprise-logo"
            @update:image="form.logo = $event"
          />
        </div>

        <div class="field">
          <label>企业名称</label>
          <Input :value="data.enterpriseName" disabled />
        </div>
        <div class="field">
          <label>所属行业</label>
          <Input v-model="form.industry" :maxlength="20" placeholder="如：人工智能" clearable />
        </div>
        <div class="field">
          <span class="field-label">企业规模</span>
          <div class="chips">
            <Tag
              v-for="s in SIZE_OPTIONS"
              :key="s"
              class="chip"
              size="medium"
              :theme="form.size === s ? 'primary' : 'default'"
              variant="light"
              @click="form.size = s"
            >
              {{ s }}
            </Tag>
          </div>
        </div>
        <div class="field">
          <label>成立时间</label>
          <Input v-model="form.foundedAt" :maxlength="20" placeholder="如：2019-05" clearable />
        </div>
        <div class="field">
          <label>企业官网</label>
          <Input v-model="form.website" :maxlength="80" placeholder="https://" clearable />
          <p v-if="websiteError" class="field-error">{{ websiteError }}</p>
        </div>
        <div class="field">
          <label>办公地点</label>
          <Input v-model="form.address" :maxlength="60" placeholder="如：聚屿社区 3 号楼 5 层" clearable />
        </div>
        <div class="field">
          <label>企业简介</label>
          <Textarea v-model="form.description" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="300" placeholder="介绍主营业务、团队优势与合作方向…" />
        </div>
        <div class="field">
          <label>主营业务 / 服务</label>
          <Textarea v-model="form.services" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="300" placeholder="企业提供的产品与服务…" />
        </div>
        <div class="field">
          <label>核心优势</label>
          <Textarea v-model="form.advantages" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="300" placeholder="团队、技术、资源等优势…" />
        </div>

        <Button theme="primary" size="large" block :loading="submitting" @click="onSave">
          {{ submitting ? '保存中…' : '保存企业名片' }}
        </Button>
        <p class="tip">保存后立即生效（Mock 演示；真实环境为提交审核后发布）。</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-card-edit {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.draft-bar {
  display: flex;
  align-items: center;
  gap: 10px;
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

.field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-error-color);
}

.state {
  padding: 20px 0;
}

.field {
  margin-bottom: 15px;
}

.field label,
.field .field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  margin: 0;
}

.tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
