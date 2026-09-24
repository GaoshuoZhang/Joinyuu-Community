<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'tdesign-mobile-vue'
import { fetchMyApplication } from '@/api/applications'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import ListSkeleton from '@/components/ListSkeleton.vue'
import StateTag from '@/components/shared/StateTag.vue'
import type { MyApplicationDetail } from '@/types'
import { formatLocalDateTime } from '@/utils/format'
import { safeHttpUrl } from '@/utils/validators'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const { data: application, loading, error, run } = useAsyncList<MyApplicationDetail>(() => fetchMyApplication(id))
onMounted(run)

const typeLabel = { settle: '企业入驻', cooperation: '合作伙伴', individual: '人才登记' } as const
</script>

<template>
  <div class="detail-page page-fade-in">
    <ListSkeleton v-if="loading" :rows="3" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <template v-else-if="application">
      <section class="m-card hero">
        <div class="head"><span class="kind">{{ typeLabel[application.type] }}</span><StateTag kind="application" :value="application.status" /></div>
        <h2>{{ application.targetName }}</h2>
        <p>编号 {{ application.id }} · 提交于 {{ formatLocalDateTime(application.submittedAt) }}</p>
        <p v-if="application.reviewedAt">审核于 {{ formatLocalDateTime(application.reviewedAt) }}</p>
      </section>

      <section class="m-card section">
        <h3>申请内容</h3>
        <p v-if="!application.fields.length && application.summary" class="summary">{{ application.summary }}</p>
        <dl v-else class="fields">
          <template v-for="field in application.fields" :key="field.key ?? field.label">
            <dt>{{ field.label }}</dt>
            <dd v-if="field.value">{{ field.value }}</dd>
            <dd v-else-if="field.files?.length" class="files">
              <template v-for="file in field.files" :key="file.name">
                <a v-if="safeHttpUrl(file.url)" :href="safeHttpUrl(file.url)" target="_blank" rel="noopener">{{ file.name }}</a>
                <span v-else>{{ file.name }}</span>
              </template>
            </dd>
            <!-- 既无值也无附件时给出占位，避免整行只剩标签 -->
            <dd v-else class="blank">未填写</dd>
          </template>
        </dl>
        <p v-if="application.note" class="note"><b>补充说明</b><br />{{ application.note }}</p>
      </section>

      <section v-if="application.rejectReason" class="m-card section reject"><h3>审核意见</h3><p>{{ application.rejectReason }}</p></section>
      <section v-if="application.records.length" class="m-card section">
        <h3>处理进度</h3>
        <ol class="timeline">
          <li v-for="(record, index) in application.records" :key="`${record.at}-${index}`">
            <b>{{ record.title }}</b><span>{{ formatLocalDateTime(record.at) }}</span>
            <p v-if="record.text">{{ record.text }}</p><small v-if="record.operator">操作人：{{ record.operator }}</small>
          </li>
        </ol>
      </section>
      <Button block variant="text" @click="router.push('/me/applications')">返回我的申请</Button>
    </template>
  </div>
</template>

<style scoped>
.detail-page { padding: var(--app-space-8); display: flex; flex-direction: column; gap: var(--app-space-5); }
.hero, .section { display: flex; flex-direction: column; gap: var(--app-space-4); }
.head { display: flex; align-items: center; justify-content: space-between; gap: var(--app-space-4); }
.kind { font: var(--app-type-caption); color: var(--td-brand-color); }
h2, h3, p { margin: 0; }
h2 { font: var(--app-type-section); }
h3 { font: var(--app-type-card-title); }
.hero p, .summary, .note { font: var(--app-type-body-sm); color: var(--td-text-color-secondary); }
/* 标签列按各自内容自适应宽度（原 minmax(88px, auto) 为写死尺寸） */
.fields { display: grid; grid-template-columns: auto 1fr; gap: var(--app-space-4) var(--app-space-5); margin: 0; font: var(--app-type-body); }
.fields dt { color: var(--td-text-color-placeholder); }
.fields dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.fields .blank { color: var(--td-text-color-placeholder); }
.files { display: flex; flex-direction: column; gap: var(--app-space-2); }
.files a { color: var(--td-brand-color); }
.reject { border-color: var(--td-error-color-3); }
.reject p { color: var(--td-error-color); font: var(--app-type-body); }
.timeline { margin: 0; padding: 0; list-style: none; }
.timeline li { position: relative; padding: 0 0 var(--app-space-5) var(--app-space-7); border-left: 1px solid var(--td-component-border); }
.timeline li:last-child { padding-bottom: 0; }
.timeline li::before { content: ''; position: absolute; left: -5px; top: 4px; width: 9px; height: 9px; border-radius: 50%; background: var(--td-brand-color); }
.timeline b, .timeline span { display: block; font: var(--app-type-emphasis-sm); }
.timeline span, .timeline small { color: var(--td-text-color-placeholder); }
.timeline p { margin-top: var(--app-space-2); font: var(--app-type-body-sm); color: var(--td-text-color-secondary); }
</style>
