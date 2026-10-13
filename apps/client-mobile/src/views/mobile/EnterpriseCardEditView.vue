<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Cell, CheckTag, DateTimePicker, Input, Popup, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchCardSchema, fetchEnterpriseDetail, updateMyEnterprise } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import { useBusinessNow } from '@/composables/useBusinessNow'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { formatLocalDate } from '@/utils/format'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import AvatarUploader from '@/components/shared/AvatarUploader.vue'

/* 编辑企业名片（负责人或获「编辑企业名片」权限的成员）：
 * Logo / 企业名称 / 行业 / 规模 / 成立时间 / 官网 / 办公地点 / 简介 / 主营业务 / 核心优势；
 * 保存后回到企业详情，并在离开未保存修改前提供确认。 */
const route = useRoute()
const router = useRouter()
const enterpriseId = String(route.params.id)

const editableFields = ref<string[]>([])
const editable = (key: string) => editableFields.value.includes(key)
const { data, loading, error, run } = useAsyncList(async () => {
  /* 卡片 schema 失败不应连带企业详情整页报错：降级为空可编辑字段并禁用保存 */
  const [detailRes, schemaRes] = await Promise.allSettled([fetchEnterpriseDetail(enterpriseId), fetchCardSchema('enterprise')])
  if (detailRes.status === 'rejected') throw detailRes.reason
  editableFields.value = schemaRes.status === 'fulfilled' ? schemaRes.value.editableFields : []
  return detailRes.value
})
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
  if (!url || !editable('website')) return ''
  return /^https?:\/\//i.test(url) ? '' : '官网需以 http(s):// 开头'
})

/* v46：字段级行内错误（与 websiteError 同口径：绑定 .field-error 展示）；Toast 仅作提交被拦截时的汇总提示 */
const formErrors = reactive({ industry: '', size: '', description: '' })
function validate(): string {
  formErrors.industry = editable('industry') && !form.industry.trim() ? '请输入所属行业' : ''
  formErrors.size = editable('size') && !form.size ? '请选择企业规模' : ''
  formErrors.description = editable('description') && form.description.trim().length < 10 ? '企业简介至少 10 个字' : ''
  return formErrors.industry || formErrors.size || formErrors.description || websiteError.value
}

/* v46：成立时间改为月份选择器（mode="month" + format="YYYY-MM"），与后端 foundedAt 口径（如 2019-05）一致，
 * 避免自由文本产生非法格式；上限取业务当下月份，不允许选择未来月份。 */
const foundedVisible = ref(false)
const foundedValue = ref('')
const businessNowMs = useBusinessNow()
const nowMonth = computed(() => formatLocalDate(businessNowMs.value).slice(0, 7))

function openFoundedPicker() {
  foundedValue.value = form.foundedAt || nowMonth.value
  foundedVisible.value = true
}

function onFoundedConfirm(value: unknown) {
  form.foundedAt = String(value)
  foundedVisible.value = false
}

const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify(form))
const { markClean } = useUnsavedGuard(() => Boolean(data.value) && formSnapshot.value !== baseline.value)

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
  baseline.value = formSnapshot.value
}

async function onSave() {
  const firstError = validate()
  if (firstError) {
    Toast(firstError)
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
    baseline.value = formSnapshot.value
    markClean()
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
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!canEdit" text="仅企业负责人或获授权成员可编辑企业名片" />
    <template v-else-if="data">
      <section class="m-card">
        <div v-if="editable('logo')" class="field">
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
        <div v-if="editable('industry')" class="field">
          <label>所属行业</label>
          <Input v-model="form.industry" :maxlength="20" placeholder="如：人工智能…" clearable />
          <p v-if="formErrors.industry" class="field-error">{{ formErrors.industry }}</p>
        </div>
        <div v-if="editable('size')" class="field">
          <span class="field-label">企业规模</span>
          <div class="chips">
            <CheckTag
              v-for="s in SIZE_OPTIONS"
              :key="s"
              class="chip"
              size="medium"
              variant="light"
              :checked="form.size === s"
              @click="form.size = s"
            >
              {{ s }}
            </CheckTag>
          </div>
          <p v-if="formErrors.size" class="field-error">{{ formErrors.size }}</p>
        </div>
        <div v-if="editable('foundedAt')" class="field">
          <span class="field-label">成立时间</span>
          <Cell v-pressable class="date-trigger" :title="form.foundedAt || '请选择成立时间'" arrow @click="openFoundedPicker" />
          <Popup v-model:visible="foundedVisible" placement="bottom">
            <DateTimePicker
              v-model="foundedValue"
              mode="month"
              format="YYYY-MM"
              :end="nowMonth"
              title="选择成立时间"
              @confirm="onFoundedConfirm"
              @cancel="foundedVisible = false"
            />
          </Popup>
        </div>
        <div v-if="editable('website')" class="field">
          <label>企业官网</label>
          <Input v-model="form.website" :maxlength="80" placeholder="https://" clearable />
          <p v-if="websiteError" class="field-error">{{ websiteError }}</p>
        </div>
        <div v-if="editable('address')" class="field">
          <label>办公地点</label>
          <Input v-model="form.address" :maxlength="60" placeholder="如：聚屿社区 3 号楼 5 层…" clearable />
        </div>
        <div v-if="editable('description')" class="field">
          <label>企业简介</label>
          <Textarea v-model="form.description" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="300" placeholder="介绍主营业务、团队优势与合作方向…" />
          <p v-if="formErrors.description" class="field-error">{{ formErrors.description }}</p>
        </div>
        <div v-if="editable('services')" class="field">
          <label>主营业务 / 服务</label>
          <Textarea v-model="form.services" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="300" placeholder="企业提供的产品与服务…" />
        </div>
        <div v-if="editable('advantages')" class="field">
          <label>核心优势</label>
          <Textarea v-model="form.advantages" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="300" placeholder="团队、技术、资源等优势…" />
        </div>

        <Button class="mobile-sticky-action" theme="primary" size="large" block :disabled="!editableFields.length" :loading="submitting" @click="onSave">
          {{ submitting ? '保存中…' : '保存企业名片' }}
        </Button>
        <p class="tip">{{ editableFields.length ? '保存后立即生效，工作人员可维护名片内容。' : '当前名片由工作人员维护，暂未开放自助编辑。' }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-card-edit {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font: var(--app-type-caption);
  color: var(--td-error-color);
}


.field {
  margin-bottom:var(--app-space-8);
}

.field label,
.field .field-label {
  display: block;
  margin-bottom:var(--app-space-3);
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-4);
}

.chip {
  margin:0;
}

/* 月份选择器触发项：与输入框同规格（白底 + 统一圆角/描边） */
.date-trigger {
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}

.tip {
  margin:var(--app-space-5) 0 0;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}
</style>
