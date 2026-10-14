<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import type { FormProps } from 'tdesign-vue-next'
import { focusFirstInvalid, useDialogDirtyGuard, usePageDirtyGuard } from '@/utils/form'
import { AddIcon, DeleteIcon } from 'tdesign-icons-vue-next'
import { fetchPublisherOptions, fetchUndertakerOptions, initiateProject, type UndertakerOption } from '@/api/demands'
import { createProject, updateProject } from '@/api/projects'
import { fetchExperienceRules } from '@/api/rules'
import { useAuthStore } from '@/stores/auth'
import type { Demand, Milestone, MilestoneInput, Project } from '@/types'

const RichEditor = defineAsyncComponent(() => import('@/components/RichEditor.vue'))

/* 项目表单弹窗（新增 / 需求立项共用）：
 * - demand 为 null：后台直接新增项目
 * - demand 非空：需求立项，新增后与需求双向关联
 * 多承接方 + 承接占比（默认均分，除不尽时首个取余数）+ 里程碑（每节点可多选负责承接方） */
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  demand: Demand | null
  project: Project | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const formRef = ref()
const auth = useAuthStore()
/* 「回填中」标记：编辑/重新新增回填承接方与占比期间，抑制均分重算，避免静默覆盖已有占比 */
const initializing = ref(false)
const undertakerOptions = ref<UndertakerOption[]>([])

/* 需求方选项（用户 + 企业，含联系电话与邮箱用于自动填充） */
type PublisherUserOption = { uid: string; nickname: string; realName: string; phone: string; email: string; tag: '社区个体' | '个人用户' }
type PublisherEnterpriseOption = { id: string; name: string; contactName: string; contactPhone: string; contactEmail?: string; tag: '社区企业' | '合作企业' }
const publisherUsers = ref<PublisherUserOption[]>([])
const publisherEnterprises = ref<PublisherEnterpriseOption[]>([])

const form = reactive({
  projectName: '',
  undertakers: [] as string[],
  description: '',
  expReward: 100,
  /** 需求方选择值：`user:<uid>` / `enterprise:<id>` / 自定义名称 */
  demander: '',
  creatorName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  contractPrice: '',
})

/* 需求方下拉选项：企业在前、用户在后（与新增需求表单一致） */
const demanderOptions = computed(() => [
  ...publisherEnterprises.value.map((e) => ({ label: `${e.name}（${e.tag} · ${e.id}）`, value: `enterprise:${e.id}` })),
  ...publisherUsers.value.map((u) => ({ label: `${u.realName || u.nickname}（${u.tag} · ${u.uid}）`, value: `user:${u.uid}` })),
])

/* 需求方身份：由所选主体自动识别（自定义需求方标记为自定义） */
const demanderIdentityLabel = computed(() => {
  const u = publisherUsers.value.find((x) => `user:${x.uid}` === form.demander)
  if (u) return u.tag
  const e = publisherEnterprises.value.find((x) => `enterprise:${x.id}` === form.demander)
  if (e) return e.tag
  return form.demander ? '自定义' : ''
})

/* 选择需求方后自动填充联系电话与邮箱（自定义名称不覆盖已填内容） */
watch(
  () => form.demander,
  (v) => {
    if (initializing.value) return
    const u = publisherUsers.value.find((x) => `user:${x.uid}` === v)
    if (u) {
      form.contactName = u.realName || u.nickname
      form.contactPhone = u.phone
      form.contactEmail = u.email
      return
    }
    const e = publisherEnterprises.value.find((x) => `enterprise:${x.id}` === v)
    if (e) {
      form.contactName = e.contactName
      form.contactPhone = e.contactPhone
      form.contactEmail = e.contactEmail ?? ''
    }
  },
)

/* 未保存保护：打开时记录基线，关闭前有改动需确认 */
const { markBaseline, isDirty, guardClose } = useDialogDirtyGuard(form)

/* 经验值规则默认值：项目结项奖励（关闭自定义时按此分配） */
const ruleExp = ref(100)

/* 自定义新增承接方的联系人信息（key = 表单值） */
const customContacts = reactive<Record<string, { contactName: string; phone: string }>>({})

/* 自定义新增的承接方（不在预设选项内的值） */
const customRows = computed(() =>
  form.undertakers.filter((v) => !undertakerOptions.value.some((o) => o.value === v)),
)

function undertakerNameOf(v: string): string {
  return undertakerOptions.value.find((o) => o.value === v)?.label ?? v
}

function customContactsClear() {
  Object.keys(customContacts).forEach((k) => delete customContacts[k])
}

/** 编辑/重新新增回填需求方：主体 ID 前缀 U=用户，其余（E/XE）=企业；无 ID 时回落到名称（自定义） */
function applyProjectDemander(p: Project) {
  const id = p.demanderId ?? ''
  form.demander = id ? (id.startsWith('U') ? `user:${id}` : `enterprise:${id}`) : (p.demanderName ?? '')
}

function ensureContact(key: string) {
  if (!customContacts[key]) customContacts[key] = { contactName: '', phone: '' }
  return customContacts[key]
}

/* 与 form.undertakers 选择顺序对齐的占比数组 */
const shares = ref<number[]>([])

interface MilestoneRow {
  name: string
  date: string
  owners: string[]
  /** start=固定「项目立项」（标题/责任方只读）；end=固定「预期交付」（标题只读） */
  fixed?: 'start' | 'end'
}

const FIXED_START_NAME = '项目立项'
const FIXED_END_NAME = '预期交付'

function todayStr(): string {
  const n = new Date()
  const p2 = (x: number) => String(x).padStart(2, '0')
  return n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate())
}

/* 两个固定节点 + 中间插入的动态节点；动态节点提交顺序即数组顺序 */
function buildFixedMilestones(): MilestoneRow[] {
  return [
    { name: FIXED_START_NAME, date: todayStr(), owners: [], fixed: 'start' },
    { name: FIXED_END_NAME, date: '', owners: [], fixed: 'end' },
  ]
}

function normalizeMilestones(rows: Milestone[]): MilestoneRow[] {
  const list: MilestoneRow[] = rows.map((m) => ({ name: m.name, date: m.date, owners: [...(m.owners ?? [])] }))
  /* 首部确保「项目立项」，尾部确保「预期交付」；两固定节点在匹配时也要打 fixed 标记，保证编辑态只读 */
  if (list[0]?.name === FIXED_START_NAME) {
    list[0].fixed = 'start'
    if (!list[0].date) list[0].date = todayStr()
  } else {
    list.unshift({ name: FIXED_START_NAME, date: todayStr(), owners: [], fixed: 'start' })
  }
  const last = list[list.length - 1]
  if (last?.name === FIXED_END_NAME) {
    last.fixed = 'end'
  } else {
    list.push({ name: FIXED_END_NAME, date: '', owners: [], fixed: 'end' })
  }
  return list
}

const milestones = ref<MilestoneRow[]>(buildFixedMilestones())

/* 均分：整数百分比，除不尽时首个承接方取余数（3 个 → 34/33/33） */
function evenShares(n: number): number[] {
  const base = Math.floor(100 / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? 100 - base * (n - 1) : base))
}

watch(
  () => props.visible,
  (v) => {
    if (v) void ensureOptions()
    if (v && props.mode === 'edit' && props.project) {
      /* 编辑：回填项目现有数据（承接方 value = type:id 与选项格式对齐） */
      initializing.value = true
      form.projectName = props.project.name
      form.undertakers = props.project.undertakers.map((t) => t.type + ':' + t.id)
      form.description = props.project.description
      shares.value = props.project.undertakers.map((t) => t.share)
      milestones.value = normalizeMilestones(props.project.milestones)
      form.expReward = props.project.expReward ?? ruleExp.value
      applyProjectDemander(props.project)
      form.creatorName = props.project.creatorName ?? ''
      form.contactName = props.project.contactName ?? ''
      form.contactPhone = props.project.contactPhone ?? ''
      form.contactEmail = props.project.contactEmail ?? ''
      form.contractPrice = props.project.contractPrice ?? ''
      customContactsClear()
      props.project.undertakers
        .filter((t) => t.type === 'custom')
        .forEach((t) => {
          customContacts[t.name] = { contactName: t.contactName ?? '', phone: t.phone ?? '' }
        })
      markBaseline()
      nextTick(() => {
        formRef.value?.clearValidate()
        initializing.value = false
      })
      return
    }
    if (v && props.mode === 'create' && props.project) {
      /* 重新新增：以已关闭项目为模板预填（保存时生成新项目编号与状态） */
      initializing.value = true
      form.projectName = props.project.name
      form.undertakers = props.project.undertakers.map((t) => t.type + ':' + t.id)
      form.description = props.project.description
      shares.value = props.project.undertakers.map((t) => t.share)
      milestones.value = props.project.milestones.length
        ? props.project.milestones.map((m) => ({ name: m.name, date: m.date, owners: [...(m.owners ?? [])] }))
        : [{ name: '', date: '', owners: [] }]
      form.expReward = props.project.expReward ?? ruleExp.value
      applyProjectDemander(props.project)
      form.creatorName = props.project.creatorName ?? ''
      form.contactName = props.project.contactName ?? ''
      form.contactPhone = props.project.contactPhone ?? ''
      form.contactEmail = props.project.contactEmail ?? ''
      form.contractPrice = props.project.contractPrice ?? ''
      customContactsClear()
      props.project.undertakers
        .filter((t) => t.type === 'custom')
        .forEach((t) => {
          customContacts[t.name] = { contactName: t.contactName ?? '', phone: t.phone ?? '' }
        })
      markBaseline()
      nextTick(() => {
        formRef.value?.clearValidate()
        initializing.value = false
      })
      return
    }
    if (v) {
      form.projectName = props.demand?.title ?? ''
      form.undertakers = []
      form.description = props.demand?.description ?? ''
      shares.value = []
      milestones.value = buildFixedMilestones()
      form.expReward = ruleExp.value
      /* 需求立项由服务端照搬需求快照；社区自建默认创建人为当前操作人 */
      form.demander = ''
      form.creatorName = auth.name
      form.contactName = ''
      form.contactPhone = ''
      form.contactEmail = ''
      form.contractPrice = ''
      customContactsClear()
      markBaseline()
      /* 清除上次会话残留的校验红框（仅清状态，不动表单值） */
      nextTick(() => formRef.value?.clearValidate())
    }
  },
)

/* 承接方选择变化 → 重置为均分（回填期间跳过，保留项目已有占比） */
watch(
  () => [...form.undertakers],
  (sel) => {
    if (initializing.value) return
    shares.value = evenShares(sel.length)
  },
)

/* 里程碑负责方候选 = 已选承接方 */
const ownerOptions = computed(() => form.undertakers.map((v) => ({ label: undertakerNameOf(v), value: undertakerNameOf(v) })))

const shareSum = computed(() => shares.value.reduce((s, v) => s + (Number(v) || 0), 0))

/* 里程碑必填校验：节点描述与日期必填，非固定节点责任方至少一项（固定「项目立项」责任方=全部承接方） */
function validateMilestones(): { result: boolean; message: string } | boolean {
  for (let i = 0; i < milestones.value.length; i++) {
    const m = milestones.value[i]
    if (!m.name.trim() || !m.date.trim()) {
      return { result: false, message: `里程碑节点（第 ${i + 1} 个）需填写节点描述与日期` }
    }
    if (!m.fixed && m.owners.length === 0) {
      return { result: false, message: `里程碑节点（第 ${i + 1} 个）责任方至少选择一项` }
    }
  }
  return true
}

/* 规则 trigger 一律 submit：值变化(change)/失焦(blur)的自动校验全部跳过——
 * 弹窗打开重置表单或 DatePicker 面板交互均不会提前红框；确认时 formRef.validate()
 * 默认 trigger='all' 会命中全部规则，此时才红框提示 */
const rules: FormProps['rules'] = {
  projectName: [{ required: true, message: '请输入项目名称', trigger: 'submit' }],
  undertakers: [
    {
      validator: (val: string[]) => !!val && val.length > 0,
      message: '请选择至少一个承接方',
      trigger: 'submit',
    },
  ],
}

/* 选项与规则值改为「首次打开弹窗时」按需加载：避免登录页/未打开时携带旧令牌请求（D-101） */
const optionsLoaded = ref(false)
let optionsPromise: Promise<void> | null = null
function ensureOptions(): Promise<void> {
  if (optionsLoaded.value) return Promise.resolve()
  if (!optionsPromise) {
    optionsPromise = Promise.all([
      fetchUndertakerOptions()
        .then((rows) => {
          undertakerOptions.value = rows
        })
        .catch(() => undefined),
      fetchPublisherOptions()
        .then((rows) => {
          publisherUsers.value = rows.users
          publisherEnterprises.value = rows.enterprises
        })
        .catch(() => undefined),
      fetchExperienceRules()
        .then((rules) => {
          ruleExp.value = rules.find((r) => r.code === 'project_completed')?.exp ?? 100
        })
        .catch(() => undefined),
    ])
      .then(() => {
        optionsLoaded.value = true
      })
      .finally(() => {
        optionsPromise = null
      })
  }
  return optionsPromise
}

function addMilestone() {
  /* 新增节点插入到两个固定节点之间（固定「预期交付」之前） */
  const idx = milestones.value.length - 1
  milestones.value.splice(idx, 0, { name: '', date: '', owners: [] })
}

function removeMilestone(i: number) {
  const m = milestones.value[i]
  if (m?.fixed) return
  milestones.value.splice(i, 1)
}

async function onConfirm() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  if (shares.value.some((s) => !Number.isInteger(s) || s < 0) || shareSum.value !== 100) {
    MessagePlugin.warning('承接占比须为不小于 0 的整数，且合计为 100%')
    return
  }
  /* 固定「项目立项」责任方视为全部承接方，提交前清空其显式选择 */
  for (const m of milestones.value) {
    if (m.fixed === 'start' && m.owners.length > 0) m.owners = []
  }
  submitting.value = true
  try {
    const missingContact = customRows.value.find((v) => {
      const c = customContacts[v]
      return !c || !c.contactName.trim() || !c.phone.trim()
    })
    if (missingContact) {
      MessagePlugin.warning('自定义承接方需补全联系人与联系电话')
      return
    }
    const isDemandInitiation = props.mode === 'create' && !!props.demand
    const demanderUser = publisherUsers.value.find((x) => `user:${x.uid}` === form.demander)
    const demanderEnterprise = publisherEnterprises.value.find((x) => `enterprise:${x.id}` === form.demander)
    /* 需求立项：需求方信息由服务端照搬需求快照，不提交表单值 */
    const demanderSnapshot = isDemandInitiation
      ? {}
      : {
          demanderId: demanderUser?.uid ?? demanderEnterprise?.id ?? '',
          demanderName: demanderUser
            ? demanderUser.realName || demanderUser.nickname
            : demanderEnterprise
              ? demanderEnterprise.name
              : form.demander.trim(),
          demanderIdentity: demanderUser
            ? { type: demanderUser.tag === '社区个体' ? 'community_individual' : 'individual', title: demanderUser.tag }
            : demanderEnterprise
              ? {
                  type: demanderEnterprise.tag === '社区企业' ? 'community_enterprise' : 'external_enterprise',
                  enterpriseId: demanderEnterprise.id,
                  enterpriseName: demanderEnterprise.name,
                }
              : form.demander.trim()
                ? { type: 'custom', title: '自定义' }
                : null,
          creatorName: form.creatorName.trim(),
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.trim(),
          contactEmail: form.contactEmail.trim(),
          contractPrice: form.contractPrice.trim(),
        }
    const payload = {
      undertakers: form.undertakers.map((v, i) => {
        const known = undertakerOptions.value.find((o) => o.value === v)
        if (!known) {
          const c = customContacts[v] ?? { contactName: '', phone: '' }
          return { type: 'custom' as const, id: '', name: v, share: shares.value[i], contactName: c.contactName, phone: c.phone }
        }
        const [type, id] = v.split(':')
        return { type: type as 'enterprise' | 'individual', id, share: shares.value[i] }
      }),
      projectName: form.projectName,
      description: form.description,
      milestones: milestones.value.map((m): MilestoneInput => ({ name: m.name, date: m.date, owners: m.owners })),
      expReward: form.expReward,
      ...demanderSnapshot,
    }
    let project: Project
    if (props.mode === 'edit' && props.project) {
      await updateProject(props.project.id, payload)
      MessagePlugin.success('项目修改已保存')
    } else if (props.demand) {
      project = await initiateProject(props.demand.id, payload)
      MessagePlugin.success(`立项成功，项目编号 ${project.code}`)
    } else {
      project = await createProject(payload)
      MessagePlugin.success(`项目已新增，编号 ${project.code}`)
    }
    emit('update:visible', false)
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  /* 未保存保护：有改动时弹确认（见 useDialogDirtyGuard） */
  guardClose(() => emit('update:visible', false))
}
usePageDirtyGuard(computed(() => props.visible && isDirty.value))
</script>

<template>
  <t-dialog
    lazy
    destroy-on-close
    :close-on-overlay-click="true"
    :visible="visible"
    :header="mode === 'edit' ? '编辑项目' : demand ? '需求立项' : '新增项目'"
    width="880px"
    :close-on-esc-keydown="false"
    @close="onClose"
  >
    <template #footer>
      <div class="dialog-footer">
        <t-button variant="text" theme="default" @click="onClose">取消</t-button>
        <t-button theme="primary" :loading="submitting" @click="onConfirm">
          {{ mode === 'edit' ? '保存修改' : demand ? '确认立项' : '确认新增' }}
        </t-button>
      </div>
    </template>
    <p v-if="demand" class="demand-context">立项需求：{{ demand.title }}（{{ demand.id }}）</p>

    <t-form ref="formRef" :data="{ ...form, milestones: milestones }" :rules="rules" label-align="top">
      <t-form-item label="项目名称" name="projectName">
        <t-input v-accessible-field clearable v-model="form.projectName" placeholder="需求立项默认取需求标题，可修改…" />
      </t-form-item>

      <!-- 需求方信息：需求立项由服务端照搬需求快照（只读提示）；社区自建项目在此登记 -->
      <template v-if="!demand">
        <div class="scope-head">
          <span class="scope-title">需求方信息</span>
          <span class="scope-tip">社区自建项目需登记需求方与联系电话，便于后续对接与追溯</span>
        </div>
        <div class="form-row">
          <t-form-item label="需求方">
            <t-select
              v-accessible-field
              v-model="form.demander"
              filterable
              creatable
              clearable
              :options="demanderOptions"
              placeholder="选择用户/企业，或输入自定义需求方…"
            />
          </t-form-item>
          <t-form-item label="需求方身份">
            <t-input v-accessible-field :value="demanderIdentityLabel" disabled placeholder="选择需求方后自动识别…" />
          </t-form-item>
        </div>
        <div class="form-row">
          <t-form-item label="创建人">
            <t-input v-accessible-field clearable v-model="form.creatorName" placeholder="创建人…" />
          </t-form-item>
          <t-form-item label="合同价格">
            <t-input v-accessible-field clearable v-model="form.contractPrice" placeholder="如：¥50,000 / 面议…" />
          </t-form-item>
        </div>
        <div class="form-row">
          <t-form-item label="联系人">
            <t-input v-accessible-field clearable v-model="form.contactName" placeholder="联系人姓名…" />
          </t-form-item>
          <t-form-item label="联系电话">
            <t-input v-accessible-field clearable v-model="form.contactPhone" placeholder="联系电话…" />
          </t-form-item>
        </div>
        <t-form-item label="联系邮箱">
          <t-input v-accessible-field clearable v-model="form.contactEmail" placeholder="联系邮箱…" />
        </t-form-item>
      </template>
      <p v-else class="demand-context">需求方信息将照搬需求「{{ demand.publisherName }}」及其联系电话与预算口径</p>
      <t-form-item label="承接方（可多选/自定义）" name="undertakers">
        <t-select
          v-accessible-field="'搜索或选择承接方（社区企业/合作企业/用户），可输入名称自定义新增'"
          v-model="form.undertakers"
          multiple
          filterable
          creatable
          clearable
          :options="undertakerOptions"
          placeholder="搜索或选择承接方（社区企业/合作企业/用户），可输入名称自定义新增…"
        />
      </t-form-item>

      <!-- 自定义新增承接方的联系人信息 -->
      <div v-if="customRows.length" class="scope-head">
        <span class="scope-title">自定义承接方联系人</span>
        <span class="scope-tip">自定义新增的主体需补充联系人与联系电话（不参与经验值分配）</span>
      </div>
      <div v-for="v in customRows" :key="v" class="form-row">
        <t-form-item :label="v + ' · 联系人'">
          <t-input
            v-accessible-field
 clearable
            :value="ensureContact(v).contactName"
            placeholder="联系人姓名…"
            @change="(val: string) => (ensureContact(v).contactName = val)"
          />
        </t-form-item>
        <t-form-item :label="v + ' · 联系电话'">
          <t-input
            v-accessible-field
 clearable
            :value="ensureContact(v).phone"
            placeholder="联系电话…"
            @change="(val: string) => (ensureContact(v).phone = val)"
          />
        </t-form-item>
      </div>

      <t-form-item :label="`项目经验值（规则值：${ruleExp}）`" name="expReward">
        <t-input-number v-accessible-field v-model="form.expReward" :min="0" theme="column" class="ctl-w-full" />
      </t-form-item>

      <!-- 承接占比 -->
      <div v-if="form.undertakers.length" class="share-block">
        <div class="share-head">
          <span class="share-title">承接占比</span>
          <span class="share-tip">社区企业与社区个体，将按以下占比进行经验值分成。</span>
        </div>
        <div v-for="(v, i) in form.undertakers" :key="v" class="share-row">
          <span class="share-name" :title="undertakerNameOf(v)">{{ undertakerNameOf(v) }}</span>
          <t-input-number v-accessible-field="`${undertakerNameOf(v)}承接占比`" class="ctl-w-sm"
            v-model="shares[i]"
            :min="0"
            :max="100"
            :step="1"
            theme="column"
          />
          <span class="share-unit">%</span>
        </div>
        <div class="share-sum" :class="{ error: shareSum !== 100 }">
          合计：{{ shareSum }}%<template v-if="shareSum !== 100">（须为 100%）</template>
        </div>
      </div>

      <t-form-item label="项目说明" name="description">
        <RichEditor v-accessible-field v-model="form.description" placeholder="项目说明…" :min-height="320" />
      </t-form-item>

      <t-form-item name="milestones" :rules="[{ validator: validateMilestones, trigger: 'submit' }]">
      <div class="milestone-block">
        <div class="milestone-head">
          <span class="milestone-label">里程碑节点</span>
          <t-button variant="dashed" size="small" @click="addMilestone">
            <template #icon><AddIcon /></template>
            新增节点
          </t-button>
        </div>
        <div v-for="(m, i) in milestones" :key="i" class="milestone-row">
          <template v-if="m.fixed === 'start'">
            <t-input v-accessible-field="'里程碑类型'" disabled value="项目立项" />
            <t-date-picker v-accessible-field="`里程碑 ${i + 1} 日期`" clearable v-model="m.date" placeholder="日期 *…" />
            <span class="milestone-ghost"></span>
            <t-select
              v-accessible-field="`里程碑 ${i + 1} 责任方`"
              v-model="m.owners"
              multiple
              :options="ownerOptions"
              disabled
              placeholder="责任方：全部承接方（固定）…"
            />
          </template>
          <template v-else-if="m.fixed === 'end'">
            <t-input v-accessible-field="'里程碑类型'" disabled value="预期交付" />
            <t-date-picker v-accessible-field="`里程碑 ${i + 1} 日期`" clearable v-model="m.date" placeholder="日期 *…" />
            <span class="milestone-ghost"></span>
            <t-select
              v-accessible-field="`里程碑 ${i + 1} 责任方`"
              v-model="m.owners"
              multiple
              clearable
              :options="ownerOptions"
              placeholder="责任方 *（不选 = 全部承接方）…"
            />
          </template>
          <template v-else>
            <t-input v-accessible-field="`里程碑 ${i + 1} 描述`" clearable v-model="m.name" placeholder="节点描述 *…" />
            <t-date-picker v-accessible-field="`里程碑 ${i + 1} 日期`" clearable v-model="m.date" placeholder="日期 *…" />
            <t-button variant="text" theme="danger" size="small" :aria-label="`删除里程碑节点 ${i + 1}`" @click="removeMilestone(i)">
              <template #icon><DeleteIcon /></template>
            </t-button>
            <t-select
              v-accessible-field="`里程碑 ${i + 1} 责任方`"
              v-model="m.owners"
              multiple
              clearable
              :options="ownerOptions"
              placeholder="责任方 *（可多选）…"
            />
          </template>
        </div>
      </div>
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<style scoped>
.demand-context {
  margin: 0 0 16px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
  border-radius: var(--td-radius-medium);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.share-block {
  margin-bottom: 16px;
  padding: 12px 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.share-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.share-title {
  font-size: 14px;
  font-weight: 400;
  color: var(--td-text-color-primary);
}

.share-tip {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.share-row {
  display: grid;
  grid-template-columns: 1fr 120px 20px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.share-name {
  font-size: 14px;
  color: var(--td-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-unit {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.share-sum {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.share-sum.error {
  color: var(--td-error-color);
}

.milestone-block {
  margin-top: 4px;
}

.milestone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.milestone-label {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.milestone-row {
  display: grid;
  /* minmax(0,1fr)：防止内容（长占位/多选标签）按 min-content 撑破列导致超宽出横向滚动条 */
  grid-template-columns: minmax(0, 1fr) 150px 36px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  min-width: 0;
}

/* 里程碑行：输入框/选择器在 grid 列内铺满并可收缩（min-width:0），依赖 TDesign 根类名 .t-input/.t-select */
.milestone-row :deep(.t-input),
.milestone-row :deep(.t-select) {
  width: 100%;
  min-width: 0;
}

.milestone-ghost {
  width: 32px;
  height: 32px;
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
