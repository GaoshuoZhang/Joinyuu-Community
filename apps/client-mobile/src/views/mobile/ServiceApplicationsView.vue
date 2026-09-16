<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading, Popup, Tag, Textarea, Toast, Input } from 'tdesign-mobile-vue'
import { applyCommunityService, listMyServiceApplications } from '@/api/community'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 我的服务申请：社区政策/服务的在线办理进度（Mock；接入期接 /api/app/me/service-applications）。 */
const route = useRoute()
const router = useRouter()
const { data, loading, error, run } = useAsyncList(listMyServiceApplications)
onMounted(run)

/* v42：从社区服务弹层跳入时带 ?apply=<policyId>&title=<title> 直接办理 */
const applyVisible = computed(() => Boolean(route.query.apply))
const applyForm = reactive({ applicantName: '', phone: '', note: '' })
const applying = ref(false)
async function onSubmitApply() {
  applying.value = true
  try {
    await applyCommunityService({ policyId: String(route.query.apply), applicantName: applyForm.applicantName, phone: applyForm.phone, note: applyForm.note })
    Toast('申请已提交，请留意站内信')
    applyForm.applicantName = ''
    applyForm.phone = ''
    applyForm.note = ''
    void router.replace({ query: {} })
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '提交失败，请稍后重试')
  } finally {
    applying.value = false
  }
}

const STATUS: Record<string, { label: string; theme: 'warning' | 'primary' | 'success' }> = {
  pending: { label: '待受理', theme: 'warning' },
  processing: { label: '处理中', theme: 'primary' },
  done: { label: '已办结', theme: 'success' },
}
</script>

<template>
  <div class="page-fade-in services-page">
    <Popup :visible="applyVisible" placement="bottom" @update:visible="(v) => { if (!v) void router.replace({ query: {} }) }">
      <div class="apply-sheet">
        <h3 class="apply-title">申请「{{ route.query.title ?? '社区服务' }}」</h3>
        <Input v-model="applyForm.applicantName" placeholder="申请人姓名" :maxlength="20" />
        <Input v-model="applyForm.phone" type="tel" :maxlength="11" placeholder="联系电话" />
        <Textarea v-model="applyForm.note" :autosize="{ minRows: 2, maxRows: 4 }" :maxlength="120" placeholder="补充说明（选填）" />
        <Button theme="primary" block :loading="applying" @click="onSubmitApply">提交申请</Button>
      </div>
    </Popup>
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <EmptyBlock
      v-else-if="!(data ?? []).length"
      text="暂无服务申请，去社区服务选择可办理事项"
      action-text="去社区服务"
      @action="router.push('/community?tab=service')"
    />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ (data ?? []).length }} 条申请</p>
      <article v-for="item in data" :key="item.id" class="m-card item">
        <div class="row">
          <h3 class="title">{{ item.policyTitle }}</h3>
          <Tag :theme="STATUS[item.status]?.theme ?? 'default'" variant="light" size="medium">{{ STATUS[item.status]?.label ?? item.status }}</Tag>
        </div>
        <p class="meta">申请人：{{ item.applicantName }} · {{ item.phone }}</p>
        <p v-if="item.note" class="note">{{ item.note }}</p>
        <p class="at">提交时间：{{ item.at }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.apply-sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.apply-title {
  margin: 0;
  font-size: 16px;
}

.services-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 15px;
}

.meta {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.note {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.at {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>
