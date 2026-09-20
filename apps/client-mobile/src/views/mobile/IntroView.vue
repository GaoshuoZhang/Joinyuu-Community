<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { fetchRealName } from '@/api/me'
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
const checkingRealName = ref(false)
const talentNeedsRealName = computed(() => kind.value === 'talent' && auth.isLogged && realNameVerified.value === false)
const talentSubmitBlocked = computed(() => kind.value === 'talent' && auth.isLogged && realNameVerified.value !== true)

async function loadRealNameStatus() {
  if (kind.value !== 'talent' || !auth.isLogged) {
    realNameVerified.value = null
    return
  }
  checkingRealName.value = true
  try {
    realNameVerified.value = (await fetchRealName()).verified
  } catch {
    realNameVerified.value = false
  } finally {
    checkingRealName.value = false
  }
}

watch([kind, () => auth.isLogged], () => void loadRealNameStatus(), { immediate: true })
useRefreshOnActivate(loadRealNameStatus)

function goApply() {
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
      <span class="badge">{{ meta.badge }}</span>
      <p class="title">{{ meta.title }}</p>
      <p class="subtitle">{{ meta.subtitle }}</p>
    </header>

    <section class="m-card">
      <h2 class="sec-title">申请流程</h2>
      <ol class="steps">
        <li v-for="(s, i) in meta.steps" :key="i">
          <span class="step-no">{{ i + 1 }}</span>
          <span class="step-text">{{ s }}</span>
        </li>
      </ol>
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
    <Button theme="primary" block size="large" class="apply-btn" :disabled="talentSubmitBlocked || checkingRealName" @click="goApply">{{ meta.cta }}</Button>
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

.badge {
  display: inline-block;
  margin-bottom:var(--app-space-4);
  padding:var(--app-space-1) var(--app-space-4);
  font-size: var(--app-font-caption);
  border-radius: var(--td-tag-square-border-radius, 4px);
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.title {
  margin:0 0 var(--app-space-2);
  font-size: var(--app-font-title);
}

.subtitle {
  margin:0;
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin:0 0 var(--app-space-5);
  font-size: var(--app-font-subtitle);
}

.steps {
  margin:0;
  padding:0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

.steps li {
  display: flex;
  align-items: flex-start;
  gap:var(--app-space-5);
}

.step-no {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-top:var(--app-space-1);
  font-size: var(--app-font-caption);
  font-weight: 600;
  border-radius: 50%;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.step-text {
  font-size: var(--app-font-body);
  line-height: 1.6;
}

.bullets {
  margin:0;
  padding:0 0 0 var(--app-space-8);
}

.bullets li {
  font-size: var(--app-font-body);
  line-height: 1.9;
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
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
