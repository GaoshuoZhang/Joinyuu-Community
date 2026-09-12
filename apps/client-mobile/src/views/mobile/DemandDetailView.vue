<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Textarea, Toast } from 'tdesign-mobile-vue'
import { fetchDemand, respondDemand } from '@/api/demands'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useAsyncList } from '@/composables/useAsyncList'
import IdentityTag from '@/components/shared/IdentityTag.vue'
import StateTag from '@/components/shared/StateTag.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

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
    <div v-if="loading" class="hint">加载中…</div>
    <template v-else-if="error">
      <EmptyBlock :text="error" />
      <Button theme="default" variant="outline" block class="back-btn" @click="router.push('/demands')">返回需求广场</Button>
    </template>
    <template v-else-if="demand">
      <div class="m-card">
        <div class="head">
          <h1 class="title">{{ demand.title }}</h1>
          <StateTag kind="demand" :value="demand.status" />
        </div>
        <div class="meta">
          <span class="cat">{{ demand.categoryLabel }}</span>
          <span class="pub">
            <IdentityTag :type="demand.publisherIdentity" />
            <span class="pub-name">{{ demand.publisherName }}</span>
          </span>
        </div>
        <p class="deadline">截止 {{ demand.deadline }} · {{ demand.responseCount }} 人响应</p>
        <p class="desc">{{ demand.description }}</p>
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
  gap: 14px;
}

.hint {
  padding: 20px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  text-align: center;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
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
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
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
  border-radius: var(--td-radius-medium);
  padding: 12px 14px;
}

.notice.done {
  color: var(--td-success-color);
  border-style: solid;
}

.submit-btn {
  margin-top: 10px;
}

.back-btn {
  flex-shrink: 0;
}
</style>
