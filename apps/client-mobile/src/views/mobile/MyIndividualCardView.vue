<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, Button, Icon, Input, Switch, Tag, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchCardSchema, fetchMyCards, updateIndividualCard } from '@/api/enterprises'
import { useAsyncList } from '@/composables/useAsyncList'
import { useUnsavedGuard } from '@/composables/useUnsavedGuard'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/http'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { INDIVIDUAL_LIST_SECTIONS } from '@/constants/individualCard'

/* 个人名片（简历式）：预览 + 分段编辑（可增删）；
 * 头像同步个人资料；保存即生效并公开到社区人才库；v35 支持敏感字段可见性与公开预览。 */
const router = useRouter()
const auth = useAuthStore()
const editableFields = ref<string[]>([])
const editable = (key: string) => editableFields.value.includes(key)
const { data, loading, error, run } = useAsyncList(async () => {
  const [cards, schema] = await Promise.all([fetchMyCards(), fetchCardSchema('individual')])
  editableFields.value = schema.editableFields
  return cards
})
onMounted(async () => {
  await run()
  fillForm()
})

const card = computed(() => data.value?.individual)
const submitting = ref(false)
const formErrors = reactive({ displayName: '', intro: '', links: '' })

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
  showAge: true,
  showPoliticalStatus: true,
})

const loaded = ref(false)
const baseline = ref('')
const formSnapshot = computed(() => JSON.stringify(form))
const { markClean } = useUnsavedGuard(() => loaded.value && formSnapshot.value !== baseline.value)


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
  form.showAge = c.visibility?.age ?? true
  form.showPoliticalStatus = c.visibility?.politicalStatus ?? true
  baseline.value = formSnapshot.value
  loaded.value = true
}

function parseSkills(): string[] {
  return form.skillsText.split(/[、,，\s]+/).filter(Boolean)
}

function addEntry(key: (typeof INDIVIDUAL_LIST_SECTIONS)[number]['key']) {
  const section = INDIVIDUAL_LIST_SECTIONS.find((s) => s.key === key)
  if (!section) return
  form[key].push(Object.fromEntries(section.fields.map((f) => [f.k, ''])))
}

function removeEntry(key: (typeof INDIVIDUAL_LIST_SECTIONS)[number]['key'], index: number) {
  form[key].splice(index, 1)
}

async function onSave() {
  formErrors.displayName = !editable('displayName') || form.displayName.trim() ? '' : '请输入姓名'
  formErrors.intro = !editable('intro') || form.intro.trim().length >= 10 ? '' : '个人简介至少 10 个字'
  const links = [...(editable('socials') ? form.socials : []), ...(editable('customLinks') ? form.customLinks : [])]
  formErrors.links = links.some((l) => (l.url ?? '').trim() && !/^https?:\/\//.test(l.url.trim())) ? '链接需以 http(s):// 开头' : ''
  const first = Object.values(formErrors).find(Boolean)
  if (first) {
    Toast(first)
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
      visibility: { age: form.showAge, politicalStatus: form.showPoliticalStatus },
    })
    Toast('个人名片已保存')
    baseline.value = formSnapshot.value
    markClean()
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
    <ListSkeleton v-if="loading" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock v-else-if="!card" text="当前账号没有个人名片" />
    <template v-else>
      <section class="m-card preview">
        <div class="head">
          <Avatar size="52px" class="avatar" :image="card.avatar">{{ card.displayName.slice(0, 1) }}</Avatar>
          <div class="info">
            <p class="name">{{ card.displayName }}<span v-if="card.age" class="age">{{ card.age }} 岁</span></p>
            <p v-if="card.levelName" class="level">Lv.{{ card.level }} {{ card.levelName }}</p>
          </div>
          <Tag class="card-badge" size="small" variant="light" theme="primary">个人名片</Tag>
        </div>
        <router-link class="preview-link" :to="`/talents/${auth.uid}`">预览公开名片效果 <Icon aria-hidden="true" name="chevron-right" size="14px" /></router-link>
        <div v-if="card.skills.length" class="skills">
          <Tag v-for="s in card.skills" :key="s" size="small" variant="light" theme="primary" class="skill">{{ s }}</Tag>
        </div>
        <p class="intro">{{ card.intro }}</p>
      </section>

      <section class="m-card">
        <h2 class="sec-title">基本信息</h2>
        <div v-if="editable('displayName')" class="field">
          <label>姓名</label>
          <Input v-model="form.displayName" autocomplete="off" :spell-check="false" :maxlength="20" placeholder="展示在社区人才库中的名称…" clearable />
          <p v-if="formErrors.displayName" class="field-error">{{ formErrors.displayName }}</p>
        </div>
        <div v-if="editable('age')" class="field">
          <label>年龄</label>
          <Input v-model="form.age" type="number" :maxlength="3" placeholder="如：29…" clearable />
        </div>
        <div v-if="editable('politicalStatus')" class="field">
          <label>政治面貌</label>
          <Input v-model="form.politicalStatus" autocomplete="off" :maxlength="20" placeholder="如：中共党员 / 共青团员 / 群众…" clearable />
        </div>
        <div v-if="editable('skills')" class="field">
          <label>相关技能</label>
          <Input v-model="form.skillsText" :maxlength="60" placeholder="多个专长用、分隔，如：产品设计、用户研究…" clearable />
        </div>
        <div v-if="editable('intro')" class="field">
          <label>个人简介</label>
          <Textarea v-model="form.intro" :autosize="{ minRows: 4, maxRows: 10 }" :maxlength="300" placeholder="介绍你的经历、专长与合作意向…" />
          <p v-if="formErrors.intro" class="field-error">{{ formErrors.intro }}</p>
        </div>
        <div v-if="editable('industryExperience')" class="field">
          <label>行业经验</label>
          <Textarea v-model="form.industryExperience" :autosize="{ minRows: 3, maxRows: 8 }" :maxlength="300" placeholder="所在行业、年限与代表成果…" />
        </div>
      </section>

      <section v-if="editable('visibility')" class="m-card">
        <h2 class="sec-title">公开可见性</h2>
        <p class="privacy-tip">关闭后该字段不会出现在公开人才名片中。</p>
        <div class="switch-row">
          <span>公开年龄</span>
          <Switch v-model="form.showAge" />
        </div>
        <div class="switch-row">
          <span>公开政治面貌</span>
          <Switch v-model="form.showPoliticalStatus" />
        </div>
      </section>

      <section v-for="sec in INDIVIDUAL_LIST_SECTIONS.filter(s => editable(s.key))" :key="sec.key" class="m-card">
        <div class="sec-head">
          <h2 class="sec-title no-margin">{{ sec.title }}</h2>
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
        <p v-if="formErrors.links" class="field-error">{{ formErrors.links }}</p>
        <Button class="mobile-sticky-action" theme="primary" size="large" block :disabled="!editableFields.length" :loading="submitting" @click="onSave">
          {{ submitting ? '保存中…' : '保存并公开到人才库' }}
        </Button>
        <p class="tip">{{ editableFields.length ? '保存后立即公开，工作人员可维护名片内容。' : '当前名片由工作人员维护，暂未开放自助编辑。' }}</p>
        <Button variant="text" theme="primary" block @click="router.push('/community')">去社区人才库查看<template #suffix><Icon aria-hidden="true" name="chevron-right" size="14px" /></template></Button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.m-card-page {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.field-error {
  margin:var(--app-space-3) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
}


.preview .head {
  display: flex;
  align-items: center;
  gap:var(--app-space-6);
}

.avatar {
  flex-shrink: 0;
  font-size: var(--app-font-title);
  font-weight: 600;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  margin:0 0 var(--app-space-2);
  font-size: var(--app-font-title);
  font-weight: 600;
}

.age {
  margin-left:var(--app-space-4);
  font-size: var(--app-font-caption);
  font-weight: 400;
  color: var(--td-text-color-secondary);
}

.level {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

.card-badge {
  flex-shrink: 0;
}

.preview-link {
  margin:var(--app-space-5) 0 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap:var(--app-space-1);
  min-height: 44px;
  font-size: var(--app-font-caption);
  color: var(--td-brand-color);
  text-decoration: none;
  cursor: pointer;
}

.privacy-tip {
  margin:-2px 0 var(--app-space-5);
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding:var(--app-space-5) 0;
  font-size: var(--app-font-body);
  border-top: 1px solid var(--td-component-border);
}

.switch-row:first-of-type {
  border-top: 0;
}

.skills {
  display: flex;
  flex-wrap: wrap;
  gap:var(--app-space-3);
  margin-top:var(--app-space-6);
}

.skill {
  margin:0;
}

.intro {
  margin:var(--app-space-6) 0 0;
  font-size: var(--app-font-body);
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  white-space: pre-wrap;
}

.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom:var(--app-space-6);
}

.sec-title {
  margin:0 0 var(--app-space-6);
  font-size: var(--app-font-subtitle);
}

.sec-title.no-margin {
  margin:0;
}

.empty-tip {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}

.entry {
  padding:var(--app-space-6);
  margin-bottom:var(--app-space-5);
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-large);
}

.entry:last-child {
  margin-bottom:0;
}

.entry .field:last-of-type {
  margin-bottom:var(--app-space-2);
}

.entry-del {
  display: block;
  margin-left:auto;
}

.field {
  margin-bottom:var(--app-space-8);
}

.field label {
  display: block;
  margin-bottom:var(--app-space-3);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.tip {
  margin:var(--app-space-5) 0 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
