<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import CardSegmentsEditor from '@/components/CardSegmentsEditor.vue'
import { cardFields, updateCard, type CardRow } from '@/api/cards'
import { useDialogDirtyGuard } from '@/utils/form'

/* 编辑个体名片弹窗（个体详情 > 名片标签页）：
 * 文本字段 + 分段经历（教育/工作/项目/荣誉/社交/自定义链接）+ 隐私开关，与名片字段定义一致。 */
const props = defineProps<{
  visible: boolean
  uid: string
  /** 当前名片（详情页已加载），打开时作为表单初值 */
  card: CardRow | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'success'): void
}>()

const submitting = ref(false)
const form = reactive<Record<string, string>>({})
const segments = reactive<Record<string, Record<string, string>[]>>({
  education: [],
  work: [],
  projects: [],
  honors: [],
  socials: [],
  customLinks: [],
})
const visibility = reactive({ age: true, politicalStatus: true })
/* 未保存保护：基线覆盖文本字段 + 分段条目 + 隐私开关（嵌套 reactive 一并序列化） */
const { markBaseline, guardClose } = useDialogDirtyGuard(reactive({ form, segments, visibility }))
const segmentFields: Record<string, { key: string; label: string }[]> = Object.fromEntries(
  Object.entries({
    education: { school: '学校', major: '专业', degree: '学位', period: '起止时间' },
    work: { company: '公司', title: '职位', period: '起止时间', description: '工作内容' },
    projects: { name: '项目名称', role: '角色', period: '起止时间', description: '项目简介' },
    honors: { name: '荣誉名称', date: '获得时间' },
    socials: { label: '名称', url: '链接' },
    customLinks: { label: '名称', url: '链接' },
  }).map(([key, fields]) => [key, Object.entries(fields).map(([k, label]) => ({ key: k, label }))]),
)
const textFields = cardFields.individual.filter((field) => !segmentFields[field.key] && field.key !== 'visibility')
const longTextFields = ['intro', 'description', 'industryExperience', 'services', 'advantages']

/* 打开即从当前名片回填（数组字段以「、」拼接，保存时 skills 再按分隔符拆回数组） */
watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    for (const field of textFields) {
      const value = props.card?.[field.key as keyof CardRow]
      form[field.key] = Array.isArray(value) ? value.join('、') : String(value ?? '')
    }
    for (const key of Object.keys(segmentFields)) {
      segments[key] = JSON.parse(JSON.stringify(props.card?.[key as keyof CardRow] ?? []))
    }
    Object.assign(visibility, props.card?.visibility ?? { age: true, politicalStatus: true })
    markBaseline()
  },
)

async function submit() {
  if (submitting.value) return
  const payload: Record<string, unknown> = Object.fromEntries(
    textFields.map((field) => [field.key, form[field.key]?.trim() ?? '']),
  )
  Object.assign(payload, JSON.parse(JSON.stringify(segments)), {
    visibility: { ...visibility },
    skills: (form.skills ?? '').split(/[、,，]/).map((v) => v.trim()).filter(Boolean),
  })
  submitting.value = true
  try {
    await updateCard('individual', props.uid, payload)
    emit('update:visible', false)
    MessagePlugin.success('个人名片已更新')
    emit('success')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

/* 未保存保护：有改动时关闭需确认（见 useDialogDirtyGuard） */
function onClose() {
  guardClose(() => emit('update:visible', false))
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="编辑个体名片"
    width="720px"
    :confirm-btn="{ content: '保存名片', loading: submitting }"
    @confirm="submit"
    @close="onClose"
  >
    <t-form :data="form" label-align="top">
      <t-form-item v-for="field in textFields" :key="field.key" :label="field.label" :name="field.key">
        <t-textarea
          v-if="longTextFields.includes(field.key)"
          v-model="form[field.key]"
          :name="field.key"
          :placeholder="`${field.label}…`"
          :maxlength="500"
        />
        <t-input v-else v-model="form[field.key]" :name="field.key" :placeholder="`${field.label}…`" :maxlength="255" />
      </t-form-item>
    </t-form>
    <div class="privacy">
      <t-checkbox v-model="visibility.age">公开年龄</t-checkbox>
      <t-checkbox v-model="visibility.politicalStatus">公开政治面貌</t-checkbox>
    </div>
    <section v-for="(fields, key) in segmentFields" :key="key" class="section">
      <h3>{{ cardFields.individual.find((field) => field.key === key)?.label }}</h3>
      <CardSegmentsEditor v-model="segments[key]" :fields="fields" />
    </section>
  </t-dialog>
</template>

<style scoped>
.privacy {
  display: flex;
  gap: var(--td-comp-margin-m);
}
.section {
  margin-top: var(--td-comp-margin-l);
}
.section h3 {
  font: var(--td-font-title-medium);
  margin-bottom: var(--td-comp-margin-s);
}
</style>
