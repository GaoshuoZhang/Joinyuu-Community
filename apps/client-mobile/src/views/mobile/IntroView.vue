<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, StepItem, Steps, Tag } from 'tdesign-mobile-vue'
import { fetchRealName } from '@/api/me'
import { fetchMyApplications } from '@/api/applications'
import { useRefreshOnActivate } from '@/composables/useRefreshOnActivate'
import { useAuthStore } from '@/stores/auth'

/* 流程介绍页（/intros/settle | /intros/cooperation | /intros/talent）：
 * 每种入驻/登记流程独立页面：流程步骤 + 适合人群 + 所需材料 + CTA 进入对应申请表单。 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const META = {
  settle: {
    badge: '企业合作 · 方式一',
    title: '企业入驻',
    subtitle: '入驻社区并获得办公空间，成为「社区企业」',
    cta: '成为社区企业',
    form: '/applications/settle',
    steps: [
      '填写企业信息与办公空间需求',
      '上传营业执照等资料',
      '社区运营审核（约 3 个工作日）',
      '签约入驻并分配办公空间',
      '授予「社区企业」身份与经验等级',
    ],
    fit: [
      '需要在社区拥有实体办公空间的创业团队',
      '希望获得办公位、独立办公室与共享空间资源',
      '希望以企业身份发布需求、优先参与路演与闭门会',
    ],
    materials: ['营业执照（图片/PDF）', '统一社会信用代码', '企业简介与主营业务', '联系人与联系电话', '办公空间需求'],
  },
  cooperation: {
    badge: '企业合作 · 方式二',
    title: '合作伙伴',
    subtitle: '无需入驻办公，以「合作企业」身份与社区联动',
    cta: '成为合作伙伴',
    form: '/applications/cooperation',
    steps: [
      '填写机构信息与合作意向',
      '上传资质或案例材料（选填）',
      '社区运营审核与沟通（约 3 个工作日）',
      '签署合作协议',
      '授予「合作企业」身份，开通企业名片申请',
    ],
    fit: [
      '投资机构、服务机构、高校院所等',
      '希望对接社区企业资源但无需常驻办公',
      '希望以项目制 / 资源合作方式参与社区共建',
    ],
    materials: ['机构名称与机构类型', '合作领域与方式说明', '联系人信息', '资质或案例材料（选填）'],
  },
  talent: {
    badge: '社区个体',
    title: '人才登记',
    subtitle: '登记个人专长，成为「社区个体」并进入人才库',
    cta: '提交人才登记',
    form: '/applications/individual',
    steps: [
      '填写真实姓名、擅长领域与简介',
      '上传作品集或简历（选填）',
      '社区运营审核（约 3 个工作日）',
      '授予「社区个体」身份与经验等级',
      '进入人才库，可被企业检索与对接',
    ],
    fit: [
      '设计师、开发者、顾问等自由职业者与专业人才',
      '希望被社区企业按需检索与对接',
      '希望参与需求响应与项目协作',
    ],
    materials: ['真实姓名与联系电话', '擅长领域与从业年限', '个人简介', '作品集或简历（选填）'],
  },
} as const

const kind = computed(() => {
  const k = route.path.split('/').pop() ?? ''
  return (['settle', 'cooperation', 'talent'] as const).includes(k as never) ? (k as keyof typeof META) : 'settle'
})
const meta = computed(() => META[kind.value])
const realNameVerified = ref<boolean | null>(null)
/* v49：已提交过人才登记（存在 individual 申请，或已获社区个体身份）→ CTA 改为「查看申请记录」 */
const talentSubmitted = ref(false)
const checkingStatus = ref(false)
const talentNeedsRealName = computed(() => kind.value === 'talent' && auth.isLogged && !talentSubmitted.value && realNameVerified.value === false)
const talentSubmitBlocked = computed(() => kind.value === 'talent' && auth.isLogged && !talentSubmitted.value && realNameVerified.value !== true)
const ctaLabel = computed(() => (kind.value === 'talent' && talentSubmitted.value ? '查看申请记录' : meta.value.cta))
const ctaDisabled = computed(() => checkingStatus.value || (!talentSubmitted.value && talentSubmitBlocked.value))

async function loadStatus() {
  if (kind.value !== 'talent' || !auth.isLogged) {
    realNameVerified.value = null
    talentSubmitted.value = false
    return
  }
  checkingStatus.value = true
  try {
    if (auth.hasCommunityIndividual) {
      talentSubmitted.value = true
      realNameVerified.value = true
    } else {
      const apps = await fetchMyApplications()
      talentSubmitted.value = apps.some((a) => a.type === 'individual')
      realNameVerified.value = talentSubmitted.value ? true : (await fetchRealName()).verified
    }
  } catch {
    talentSubmitted.value = false
    realNameVerified.value = false
  } finally {
    checkingStatus.value = false
  }
}

watch([kind, () => auth.isLogged], () => void loadStatus(), { immediate: true })
useRefreshOnActivate(loadStatus)

function goApply() {
  /* 已提交过人才登记：进入申请记录（可查看进度/修改重提），不再重复提交 */
  if (kind.value === 'talent' && talentSubmitted.value) {
    void router.push('/me/applications')
    return
  }
  if (kind.value === 'talent' && !auth.isLogged) {
    void router.push({ path: '/login', query: { redirect: '/intros/talent' } })
    return
  }
  if (talentSubmitBlocked.value) return
  void router.push(meta.value.form)
}

function goRealName() {
  void router.push('/me/realname')
}
</script>

<template>
  <div class="intro page-fade-in">
    <header class="hero">
      <Tag class="badge" theme="primary" variant="light" size="medium">{{ meta.badge }}</Tag>
      <p class="title">{{ meta.title }}</p>
      <p class="subtitle">{{ meta.subtitle }}</p>
    </header>

    <section class="m-card">
      <h2 class="sec-title">申请流程</h2>
      <!-- 只读说明：纵向 Steps 表达步骤先后，readonly 关闭点击切换（current = 步骤数 → 全部为完成态，保持原品牌色圆点） -->
      <Steps :current="meta.steps.length" layout="vertical" readonly>
        <StepItem v-for="(s, i) in meta.steps" :key="i" :title="s" />
      </Steps>
    </section>

    <section class="m-card">
      <h2 class="sec-title">适合人群</h2>
      <ul class="bullets">
        <li v-for="(f, i) in meta.fit" :key="i">{{ f }}</li>
      </ul>
    </section>

    <section class="m-card">
      <h2 class="sec-title">所需材料</h2>
      <ul class="bullets">
        <li v-for="(m, i) in meta.materials" :key="i">{{ m }}</li>
      </ul>
    </section>

    <Button v-if="talentNeedsRealName" theme="primary" variant="outline" block size="large" class="verify-btn" @click="goRealName">进行实名认证</Button>
    <Button theme="primary" block size="large" class="apply-btn" :disabled="ctaDisabled" @click="goApply">{{ ctaLabel }}</Button>
    <p class="tip">登录后进入对应申请表单，社区运营将在 3 个工作日内完成审核</p>
  </div>
</template>

<style scoped>
.intro {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.hero {
  padding:var(--app-space-2) var(--app-space-1);
}

/* 徽标由官方 Tag 承担配色与圆角，这里只保留与标题的间距 */
.badge {
  margin-bottom: var(--app-space-4);
}

.title {
  margin:0 0 var(--app-space-2);
  font: var(--app-type-page-title);
}

.subtitle {
  margin:0;
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin:0 0 var(--app-space-5);
  font: var(--app-type-section);
}

.bullets {
  margin:0;
  padding:0 0 0 var(--app-space-8);
}

.bullets li {
  font: var(--app-type-body);
  color: var(--td-text-color-secondary);
}

.apply-btn {
  margin-top:var(--app-space-2);
}

.verify-btn + .apply-btn {
  margin-top: calc(var(--app-space-4) * -1);
}

.tip {
  margin:0;
  text-align: center;
  font: var(--app-type-caption);
  color: var(--td-text-color-placeholder);
}
</style>
