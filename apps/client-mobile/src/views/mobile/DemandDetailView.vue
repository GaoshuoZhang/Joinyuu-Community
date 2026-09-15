<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Loading, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchDemand, respondDemand } from '@/api/demands'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useAsyncList } from '@/composables/useAsyncList'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import { DEMAND_KIND_LABELS, demandDateText } from '@/constants/demand'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const id = String(route.params.id)
const { data: demand, loading, error, run } = useAsyncList(() => fetchDemand(id))

onMounted(run)

const note = ref('')
const submitting = ref(false)
const isMine = computed(() => !!demand.value?.publisherUid && demand.value.publisherUid === auth.uid)
const responded = computed(() => !!demand.value?.myResponse)

async function onRespond() {
  if (!note.value.trim()) {
    Toast('请输入响应说明')
    return
  }
  submitting.value = true
  try {
    await respondDemand(id, note.value.trim())
    Toast('响应成功，积分 +20')
    note.value = ''
    await run()
  } catch (e) {
    Toast(e instanceof ApiError ? e.message : '响应失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="m-detail page-fade-in stagger">
    <Loading v-if="loading" class="state" text="加载中…" />
    <template v-else-if="error">
      <EmptyBlock :text="error" />
    </template>
    <template v-else-if="demand">
      <div class="m-card">
        <div class="head">
          <h1 class="title">{{ demand.title }}</h1>
          <StateTag kind="demand" :value="demand.status" />
        </div>
        <div class="meta">
          <span class="cat">{{ demand.categoryLabel }}</span>
          <span v-if="demand.kind" class="kind">{{ DEMAND_KIND_LABELS[demand.kind] }}</span>
          <span class="pub">
            <IdentityTag :type="demand.publisherIdentity" />
            <span class="pub-name">{{ demand.publisherName }}</span>
          </span>
        </div>
        <p class="deadline">
          <span v-if="demandDateText(demand)">{{ demandDateText(demand) }} · </span>{{ demand.responseCount }} 人响应
        </p>
        <p class="desc">{{ demand.description }}</p>
        <div v-if="demand.kind === 'task' && (demand.deliverable || demand.budget)" class="extras">
          <p v-if="demand.deliverable"><b>期望交付：</b>{{ demand.deliverable }}</p>
          <p v-if="demand.budget"><b>预算范围：</b>{{ demand.budget }}</p>
        </div>
        <div v-else-if="demand.kind === 'investment' && (demand.cooperationNeed || demand.returnOffer)" class="extras">
          <p v-if="demand.cooperationNeed"><b>希望获得：</b>{{ demand.cooperationNeed }}</p>
          <p v-if="demand.returnOffer"><b>可提供回报：</b>{{ demand.returnOffer }}</p>
        </div>
        <div
          v-else-if="demand.kind === 'cooperation' && (demand.bottleneck || demand.partnershipMode || demand.returnOffer)"
          class="extras"
        >
          <p v-if="demand.bottleneck"><b>合作诉求：</b>{{ demand.bottleneck }}</p>
          <p v-if="demand.partnershipMode"><b>期望合作方式：</b>{{ demand.partnershipMode }}</p>
          <p v-if="demand.returnOffer"><b>可提供资源：</b>{{ demand.returnOffer }}</p>
        </div>

        <div v-if="demand.contactName || demand.contactPhone || demand.contactEmail" class="extras">
          <p v-if="demand.contactName"><b>联系人：</b>{{ demand.contactName }}</p>
          <p v-if="demand.contactPhone"><b>联系电话：</b>{{ demand.contactPhone }}</p>
          <p v-if="demand.contactEmail"><b>联系邮箱：</b>{{ demand.contactEmail }}</p>
        </div>
      </div>

      <div class="m-card">
        <h2 class="sub">响应需求</h2>
        <Button v-if="!auth.isLogged" theme="primary" block @click="router.push(`/login?redirect=${route.fullPath}`)">
          登录后响应
        </Button>
        <p v-else-if="isMine" class="notice">这是你发布的需求</p>
        <p v-else-if="responded" class="notice done">已响应过该需求</p>
        <template v-else>
          <Textarea v-model="note" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="请输入响应说明…" />
          <Button theme="primary" block class="submit-btn" :loading="submitting" @click="onRespond">响应需求</Button>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.m-detail {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 17px;
  line-height: 1.45;
  flex: 1;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.cat {
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.kind {
  font-size: 12px;
  padding: 2px 7px;
  border-radius: var(--td-radius-small);
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
}

.extras {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--td-component-border);
}

.extras p {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.extras p:last-child {
  margin-bottom: 0;
}

.extras b {
  color: var(--td-text-color-primary);
  font-weight: 600;
}

.pub {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.deadline {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.desc {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  color: var(--td-text-color-primary);
}

.sub {
  margin: 0 0 10px;
  font-size: 15px;
}

.notice {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-page);
  border: 1px dashed var(--td-component-border);
  border-radius: var(--td-radius-large);
  padding: 12px 14px;
}

.notice.done {
  color: var(--td-success-color);
  border-style: solid;
}

.submit-btn {
  margin-top: 10px;
}
</style>
