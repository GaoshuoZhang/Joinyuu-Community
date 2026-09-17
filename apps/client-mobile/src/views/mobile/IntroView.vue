<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'

/* 流程介绍页（/intros/settle | /intros/cooperation | /intros/talent）：
 * 每种入驻/登记流程独立页面：流程步骤 + 适合人群 + 所需材料 + CTA 进入对应申请表单。 */
const route = useRoute()
const router = useRouter()

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
      '希望获得工位、独立办公室与共享空间资源',
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

function goApply() {
  void router.push(meta.value.form)
}
</script>

<template>
  <div class="intro page-fade-in">
    <header class="hero">
      <span class="badge">{{ meta.badge }}</span>
      <h1 class="title">{{ meta.title }}</h1>
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

    <Button theme="primary" block size="large" class="apply-btn" @click="goApply">{{ meta.cta }}</Button>
    <p class="tip">登录后进入对应申请表单，社区运营将在 3 个工作日内完成审核</p>
  </div>
</template>

<style scoped>
.intro {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero {
  padding: 4px 2px;
}

.badge {
  display: inline-block;
  margin-bottom: 8px;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: var(--td-tag-square-border-radius, 4px);
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.title {
  margin: 0 0 4px;
  font-size: 22px;
}

.subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.sec-title {
  margin: 0 0 10px;
  font-size: 15px;
}

.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.steps li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.step-no {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 50%;
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.step-text {
  font-size: 13px;
  line-height: 1.6;
}

.bullets {
  margin: 0;
  padding: 0 0 0 16px;
}

.bullets li {
  font-size: 13px;
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.apply-btn {
  margin-top: 4px;
}

.tip {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
