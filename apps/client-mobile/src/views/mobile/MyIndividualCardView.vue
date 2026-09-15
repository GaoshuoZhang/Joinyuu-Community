<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, Button, Input, Loading, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchMyCards, updateIndividualCard } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* 个人名片（简历式，[MOCK-ONLY]，缺口 §7.1-16）：预览 + 分段编辑（可增删）；
 * 头像同步个人资料；保存即生效并公开到社区人才库。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchMyCards)
onMounted(async () => {
  await run()
  fillForm()
})

const card = computed(() => data.value?.individual)
const submitting = ref(false)

type Entry = Record<string, string>
const form = reactive({
  displayName: '',
  age: '',
  politicalStatus: '',
  intro: '',
  industryExperience: '',
  skillsText: '',
  education: [] as Entry[],
  work: [] as Entry[],
  projects: [] as Entry[],
  honors: [] as Entry[],
  socials: [] as Entry[],
  customLinks: [] as Entry[],
})

/** 可增删的分段：key = form 中的列表字段 */
const LIST_SECTIONS: {
  key: 'education' | 'work' | 'projects' | 'honors' | 'socials' | 'customLinks'
  title: string
  fields: { k: string; label: string; ph?: string; textarea?: boolean }[]
}[] = [
  {
    key: 'education',
    title: '教育经历',
    fields: [
      { k: 'school', label: '学校', ph: '如：浙江大学' },
      { k: 'major', label: '专业', ph: '如：工业设计' },
      { k: 'degree', label: '学历 / 学位', ph: '如：本科' },
      { k: 'period', label: '起止时间', ph: '如：2014 - 2018' },
    ],
  },
  {
    key: 'work',
    title: '工作经历',
    fields: [
      { k: 'company', label: '公司', ph: '如：某某科技' },
      { k: 'title', label: '职位', ph: '如：产品设计师' },
      { k: 'period', label: '起止时间', ph: '如：2021 - 至今' },
      { k: 'description', label: '工作内容', ph: '负责的事项与成果…', textarea: true },
    ],
  },
  {
    key: 'projects',
    title: '项目经历',
    fields: [
      { k: 'name', label: '项目名称', ph: '如：聚屿社区小程序' },
      { k: 'role', label: '担任角色', ph: '如：设计主理' },
      { k: 'period', label: '起止时间', ph: '如：2026' },
      { k: 'description', label: '项目简介', ph: '项目背景、成果…', textarea: true },
    ],
  },
  {
    key: 'honors',
    title: '荣誉证书',
    fields: [
      { k: 'name', label: '名称', ph: '如：红点设计概念奖' },
      { k: 'date', label: '获得时间', ph: '如：2023' },
    ],
  },
  {
    key: 'socials',
    title: '社交媒体链接',
    fields: [
      { k: 'label', label: '名称', ph: '如：GitHub / 即刻' },
      { k: 'url', label: '链接', ph: 'https://' },
    ],
  },
  {
    key: 'customLinks',
    title: '自定义链接',
    fields: [
      { k: 'label', label: '名称', ph: '如：个人作品集' },
      { k: 'url', label: '链接', ph: 'https://' },
    ],
  },
]

function fillForm() {
  const c = card.value
  if (!c) return
  form.displayName = c.displayName
  form.age = c.age ?? ''
  form.politicalStatus = c.politicalStatus ?? ''
  form.intro = c.intro
  form.industryExperience = c.industryExperience ?? ''
  form.skillsText = c.skills.join('、')
  form.education = (c.education ?? []).map((e) => ({ school: e.school ?? '', major: e.major ?? '', degree: e.degree ?? '', period: e.period ?? '' }))
  form.work = (c.work ?? []).map((w) => ({ company: w.company ?? '', title: w.title ?? '', period: w.period ?? '', description: w.description ?? '' }))
  form.projects = (c.projects ?? []).map((p) => ({ name: p.name ?? '', role: p.role ?? '', period: p.period ?? '', description: p.description ?? '' }))
  form.honors = (c.honors ?? []).map((h) => ({ name: h.name ?? '', date: h.date ?? '' }))
  form.socials = (c.socials ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' }))
  form.customLinks = (c.customLinks ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' }))
}

function parseSkills(): string[] {
  return form.skillsText.split(/[、,，\s]+/).filter(Boolean)
}

function addEntry(key: (typeof LIST_SECTIONS)[number]['key']) {
  const section = LIST_SECTIONS.find((s) => s.key === key)
  if (!section) return
  form[key].push(Object.fromEntries(section.fields.map((f) => [f.k, ''])))
}

function removeEntry(key: (typeof LIST_SECTIONS)[number]['key'], index: number) {
  form[key].splice(index, 1)
}

async function onSave() {
  if (!form.displayName.trim()) {
    Toast('请输入姓名')
    return
  }
  if (form.intro.trim().length < 10) {
    Toast('个人简介至少 10 个字')
    return
  }
  const links = [...form.socials, ...form.customLinks]
  if (links.some((l) => (l.url ?? '').trim() && !/^https?:\/\//.test(l.url.trim()))) {
    Toast('链接需以 http(s):// 开头')
    return
  }
  submitting.value = true
  try {
    await updateIndividualCard({
      displayName: form.displayName.trim(),
      age: form.age.trim() || undefined,
      politicalStatus: form.politicalStatus.trim() || undefined,
      intro: form.intro.trim(),
      industryExperience: form.industryExperience.trim() || undefined,
      skills: parseSkills(),
      education: form.education.map((e) => ({ school: e.school ?? '', major: e.major ?? '', degree: e.degree ?? '', period: e.period ?? '' })),
      work: form.work.map((w) => ({ company: w.company ?? '', title: w.title ?? '', period: w.period ?? '', description: w.description ?? '' })),
      projects: form.projects.map((p) => ({ name: p.name ?? '', role: p.role ?? '', period: p.period ?? '', description: p.description ?? '' })),
      honors: form.honors.map((h) => ({ name: h.name ?? '', date: h.date ?? '' })),
      socials: form.socials.map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
      customLinks: form.customLinks.map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
    })
    Toast('个人名片已保存')
    await run()
    fillForm()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-fade-in m-card-page">
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" />
    <EmptyBlock v-else-if="!card" text="当前账号没有个人名片" />
    <template v-else>
      <section class="m-card preview">
        <div class="head">
          <Avatar size="52px" class="avatar" :image="card.avatar">{{ card.displayName.slice(0, 1) }}</Avatar>
          <div class="info">
            <p class="name">{{ card.displayName }}<span v-if="card.age" class="age">{{ card.age }} 岁</span></p>
            <p v-if="card.levelName" class="level">Lv.{{ card.level }} {{ card.levelName }}</p>
          </div>
          <span class="card-badge">个人名片</span>
        </div>
        <div v-if="card.skills.length" class="skills">
          <Tag v-for="s in card.skills" :key="s" size="small" variant="light" theme="primary" class="skill">{{ s }}</Tag>
        </div>
        <p class="intro">{{ card.intro }}</p>
      </section>

      <section class="m-card">
        <h3 class="sec-title">基本信息</h3>
        <div class="field">
          <label>姓名</label>
          <Input v-model="form.displayName" :maxlength="20" placeholder="展示在社区人才库中的名称" clearable />
        </div>
        <div class="field">
          <label>年龄</label>
          <Input v-model="form.age" type="number" :maxlength="3" placeholder="如：29" clearable />
        </div>
        <div class="field">
          <label>政治面貌</label>
          <Input v-model="form.politicalStatus" :maxlength="20" placeholder="如：中共党员 / 共青团员 / 群众" clearable />
        </div>
        <div class="field">
          <label>相关技能</label>
          <Input v-model="form.skillsText" :maxlength="60" placeholder="多个专长用、分隔，如：产品设计、用户研究" clearable />
        </div>
        <div class="field">
          <label>个人简介</label>
          <Textarea v-model="form.intro" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="300" placeholder="介绍你的经历、专长与合作意向…" />
        </div>
        <div class="field">
          <label>行业经验</label>
          <Textarea v-model="form.industryExperience" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="300" placeholder="所在行业、年限与代表成果…" />
        </div>
      </section>

      <section v-for="sec in LIST_SECTIONS" :key="sec.key" class="m-card">
        <div class="sec-head">
          <h3 class="sec-title no-margin">{{ sec.title }}</h3>
          <Button theme="primary" variant="outline" size="small" @click="addEntry(sec.key)">添加</Button>
        </div>
        <p v-if="form[sec.key].length === 0" class="empty-tip">暂无，点击「添加」补充</p>
        <div v-for="(entry, idx) in form[sec.key]" :key="idx" class="entry">
          <div v-for="f in sec.fields" :key="f.k" class="field">
            <label>{{ f.label }}</label>
            <Textarea v-if="f.textarea" v-model="entry[f.k]" :autosize="{ minRows: 2, maxRows: 6 }" :maxlength="300" :placeholder="f.ph" />
            <Input v-else v-model="entry[f.k]" :maxlength="60" :placeholder="f.ph" clearable />
          </div>
          <Button class="entry-del" theme="danger" variant="text" size="small" @click="removeEntry(sec.key, idx)">删除此项</Button>
        </div>
      </section>

      <section class="m-card">
        <Button theme="primary" size="large" block :loading="submitting" @click="onSave">
          {{ submitting ? '保存中…' : '保存并公开到人才库' }}
        </Button>
        <p class="tip">保存后立即公开（Mock 演示；真实环境为提交审核后发布）。</p>
        <Button variant="text" theme="primary" block @click="router.push('/community')">去社区人才库查看 ›</Button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-card-page {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state {
  padding: 20px 0;
}

.preview .head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  flex-shrink: 0;
  font-size: 22px;
  font-weight: 700;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 700;
}

.age {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--td-text-color-secondary);
}

.level {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.card-badge {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.skills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.skill {
  margin: 0;
}

.intro {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.sec-title {
  margin: 0 0 12px;
  font-size: 15px;
}

.sec-title.no-margin {
  margin: 0;
}

.empty-tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.entry {
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}

.entry:last-child {
  margin-bottom: 0;
}

.entry .field:last-of-type {
  margin-bottom: 4px;
}

.entry-del {
  display: block;
  margin-left: auto;
}

.field {
  margin-bottom: 15px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.tip {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
</style>
