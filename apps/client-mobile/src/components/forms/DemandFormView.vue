<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Cell, DateTimePicker, Input, Popup, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { createDemand } from '@/api/demands'
import { fetchMyIdentities } from '@/api/enterprises'
import { ApiError } from '@/api/http'
import { useAuthStore, identityOptionLabel } from '@/stores/auth'
import { useConfigStore } from '@/stores/config'
import { useDict } from '@/composables/useDict'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { DEMAND_KINDS, DEMAND_KIND_LABELS } from '@/constants/demand'
import type { DemandKind, IdentityType, UserIdentity } from '@/types'

/* 需求发布表单（schema 由 kind 决定：找服务 / 找投资 / 找合作），提交即 pending。
 * 发布身份仅作为归属（发布后列表展示的发布方），在表单内单选；
 * 联系信息供响应方联系，task 另有「预期交付日期」。 */

const props = defineProps<{ kind: DemandKind }>()
const kindMeta = computed(() => DEMAND_KINDS.find((k) => k.kind === props.kind) ?? DEMAND_KINDS[0])
const isTask = computed(() => props.kind === 'task')
const isInvest = computed(() => props.kind === 'investment')
const kindLabel = computed(() => DEMAND_KIND_LABELS[props.kind])

/** 三类需求的字段文案 */
const labels = computed(() =>
  isTask.value
    ? { title: '需求标题', titlePh: '一句话描述你的需求', desc: '需求描述', descPh: '补充背景、期望的交付形式与合作方式…', cat: '需求类别' }
    : isInvest.value
      ? { title: '项目名称', titlePh: '一句话描述你的项目', desc: '项目简介', descPh: '介绍项目背景、当前进展与团队情况…', cat: '所属行业' }
      : { title: '合作需求标题', titlePh: '一句话概括你的合作需求', desc: '业务现状与瓶颈', descPh: '说说当前业务进展、遇到的瓶颈与期望的合作方向…', cat: '合作领域' },
)

const router = useRouter()
const auth = useAuthStore()
const config = useConfigStore()
const { items: dictItems } = useDict(isInvest.value ? 'industry' : 'demand_category')

/** 发布身份选项：持「社区个体」时不再单列「个人用户」；含成员被授权「发布需求」的企业（代企业发布） */
const delegatedIdentities = ref<UserIdentity[]>([])
const identityOptions = computed(() => {
  const base = auth.identities.filter((i) => !(i.type === 'individual' && auth.hasCommunityIndividual))
  const extra = delegatedIdentities.value.filter(
    (d) => !base.some((b) => b.type === 'community_enterprise' && b.enterpriseId === d.enterpriseId),
  )
  return [...base, ...extra]
})

/** 身份 chips 选中判定（企业需同时匹配企业 id，区分多个企业成员身份） */
function isIdentityPicked(i: UserIdentity): boolean {
  return form.asIdentity === i.type && (i.type !== 'community_enterprise' || form.asEnterpriseId === (i.enterpriseId ?? ''))
}

function pickIdentity(i: UserIdentity) {
  form.asIdentity = i.type
  form.asEnterpriseId = i.type === 'community_enterprise' ? (i.enterpriseId ?? '') : ''
}

const demandOpen = ref(true)
const submitting = ref(false)
const showDeliverBy = ref(false)
/** 预期交付日期下限 = 今天（Picker 无值时回落到 start，默认 start 为 10 年前） */
const todayStr = (() => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})()
const form = reactive({
  title: '',
  description: '',
  categoryCode: '',
  deliverable: '',
  budget: '',
  cooperationNeed: '',
  bottleneck: '',
  partnershipMode: '',
  returnOffer: '',
  deliverBy: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  asIdentity: (identityOptions.value[0]?.type ?? '') as IdentityType | '',
  asEnterpriseId: '',
})

onMounted(async () => {
  await config.ensureLoaded()
  demandOpen.value = config.config.demandOpen
  if (!auth.isLogged) return
  try {
    const list = await fetchMyIdentities()
    delegatedIdentities.value = list
      .filter((i) => i.type === 'community_enterprise' && i.enterpriseId && (i.isContact || (i.permissions ?? []).includes('publish_demand')))
      .map((i): UserIdentity => ({ type: 'community_enterprise', enterpriseId: i.enterpriseId, enterpriseName: i.name }))
  } catch {
    /* 未登录或接口异常时仅展示自有身份 */
  }
})

async function onSubmit() {
  if (!form.title.trim()) {
    Toast(`请输入${labels.value.title}`)
    return
  }
  if (!form.description.trim()) {
    Toast(`请输入${labels.value.desc}`)
    return
  }
  if (!form.categoryCode) {
    Toast(`请选择${labels.value.cat}`)
    return
  }
  if (isTask.value && !form.deliverable.trim()) {
    Toast('请输入期望交付')
    return
  }
  if (isTask.value && !form.deliverBy) {
    Toast('请选择预期交付日期')
    return
  }
  if (isInvest.value && !form.cooperationNeed.trim()) {
    Toast('请输入希望获得的投资 / 合作')
    return
  }
  if (!isTask.value && !isInvest.value && !form.bottleneck.trim()) {
    Toast('请描述业务瓶颈与合作诉求')
    return
  }
  if (!form.contactName.trim()) {
    Toast('请输入联系人')
    return
  }
  if (!/^1\d{10}$/.test(form.contactPhone.trim())) {
    Toast('请输入正确的联系电话')
    return
  }
  if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
    Toast('请输入正确的联系邮箱')
    return
  }
  if (!form.asIdentity) {
    Toast('请选择发布身份')
    return
  }
  submitting.value = true
  try {
    await createDemand({
      kind: props.kind,
      title: form.title.trim(),
      description: form.description.trim(),
      categoryCode: form.categoryCode,
      categoryDict: isInvest.value ? 'industry' : 'demand_category',
      asIdentity: form.asIdentity,
      ...(form.asIdentity === 'community_enterprise' && form.asEnterpriseId ? { asEnterpriseId: form.asEnterpriseId } : {}),
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.trim(),
      contactEmail: form.contactEmail.trim() || undefined,
      ...(isTask.value
        ? { deliverable: form.deliverable.trim(), budget: form.budget.trim() || undefined, deliverBy: form.deliverBy }
        : isInvest.value
          ? { cooperationNeed: form.cooperationNeed.trim(), returnOffer: form.returnOffer.trim() || undefined }
          : {
              bottleneck: form.bottleneck.trim(),
              partnershipMode: form.partnershipMode.trim() || undefined,
              returnOffer: form.returnOffer.trim() || undefined,
            }),
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
  <div class="m-demand-form page-fade-in">
    <div v-if="!demandOpen">
      <EmptyBlock text="发布功能暂未开放" />
    </div>

    <template v-else>
      <h1 class="title">{{ kindLabel }}</h1>
      <p class="subtitle">提交后进入审核，通过后展示在项目列表</p>

      <div class="flow m-card">
        <span class="flow-label">发布后推进流程</span>
        <div class="flow-steps">
          <template v-for="(s, i) in kindMeta.process" :key="s">
            <span class="flow-step">{{ s }}</span>
            <span v-if="i < kindMeta.process.length - 1" class="flow-arrow">›</span>
          </template>
        </div>
      </div>

      <div class="field">
        <label>{{ labels.title }}</label>
        <Input v-model="form.title" :maxlength="50" :placeholder="labels.titlePh" clearable />
      </div>

      <div class="field">
        <label>{{ labels.desc }}</label>
        <Textarea v-model="form.description" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="1000" :placeholder="labels.descPh" />
      </div>

      <div class="field">
        <span class="field-label">{{ labels.cat }}</span>
        <div class="chips">
          <Tag
            v-for="c in dictItems"
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

      <template v-if="isTask">
        <div class="field">
          <label>期望交付</label>
          <Textarea
            v-model="form.deliverable"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="希望对方交付什么（成果物、验收标准、周期…）"
          />
        </div>
        <div class="field">
          <label>预算范围（选填）</label>
          <Input v-model="form.budget" :maxlength="50" placeholder="如：¥8,000 - 15,000 / 面议" clearable />
        </div>
        <div class="field">
          <span class="field-label">预期交付日期</span>
          <Cell class="date-trigger" :title="form.deliverBy || '请选择预期交付日期'" arrow @click="showDeliverBy = true" />
          <Popup v-model:visible="showDeliverBy" placement="bottom">
            <DateTimePicker
              v-model="form.deliverBy"
              mode="date"
              format="YYYY-MM-DD"
              :start="todayStr"
              title="选择预期交付日期"
              @confirm="showDeliverBy = false"
              @cancel="showDeliverBy = false"
            />
          </Popup>
        </div>
      </template>

      <template v-else-if="isInvest">
        <div class="field">
          <label>希望获得的投资 / 合作</label>
          <Textarea
            v-model="form.cooperationNeed"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="如：天使轮融资 50 万、渠道资源合作、联合研发…"
          />
        </div>
        <div class="field">
          <label>可提供的回报与资源（选填）</label>
          <Textarea
            v-model="form.returnOffer"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="如：股权、项目分红、技术与团队能力…"
          />
        </div>
      </template>

      <template v-else>
        <div class="field">
          <label>业务瓶颈与合作诉求</label>
          <Textarea
            v-model="form.bottleneck"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="当前卡在哪里、希望对方补足什么能力或资源…"
          />
        </div>
        <div class="field">
          <label>期望的合作方式（选填）</label>
          <Input v-model="form.partnershipMode" :maxlength="80" placeholder="如：项目制合作、联合运营、渠道分成…" clearable />
        </div>
        <div class="field">
          <label>可提供的资源与回报（选填）</label>
          <Textarea
            v-model="form.returnOffer"
            :autosize="{ minRows: 3, maxRows: 6 }"
            :maxlength="500"
            placeholder="如：客户资源、供应链能力、收益分成…"
          />
        </div>
      </template>

      <div class="field">
        <label>联系人</label>
        <Input v-model="form.contactName" :maxlength="20" placeholder="请输入联系人姓名" clearable />
      </div>
      <div class="field">
        <label>联系电话</label>
        <Input v-model="form.contactPhone" type="tel" :maxlength="11" placeholder="请输入 11 位手机号" clearable />
      </div>
      <div class="field">
        <label>联系邮箱（选填）</label>
        <Input v-model="form.contactEmail" :maxlength="60" placeholder="便于对方直接邮件联系" clearable />
      </div>

      <div class="field">
        <span class="field-label">发布身份</span>
        <div class="chips">
          <Tag
            v-for="i in identityOptions"
            :key="`${i.type}:${i.enterpriseId ?? ''}`"
            :theme="isIdentityPicked(i) ? 'primary' : 'default'"
            variant="light"
            size="medium"
            @click="pickIdentity(i)"
          >
            {{ identityOptionLabel(i, auth.name) }}
          </Tag>
        </div>
      </div>

      <Button theme="primary" block class="submit-btn" :loading="submitting" @click="onSubmit">提交需求</Button>
    </template>
  </div>
</template>

<style scoped>
.m-demand-form {
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.title {
  margin: 0 0 4px;
  font-size: 18px;
}

.subtitle {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

/* 审核与推进流程卡 */
.flow {
  margin-bottom: 16px;
  padding: 12px 14px;
}

.flow-label {
  display: block;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
}

.flow-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.flow-step {
  font-size: 11px;
  line-height: 1;
  padding: 5px 8px;
  border-radius: var(--td-radius-default);
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
}

.flow-arrow {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.field {
  margin-bottom: 16px;
}

.field label,
.field .field-label {
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
  border-radius: var(--td-radius-large);
}

.submit-btn {
  margin-top: 8px;
}
</style>
