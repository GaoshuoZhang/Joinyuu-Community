<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Loading, Tag, Toast } from 'tdesign-mobile-vue'
import { claimPointsTask, fetchPointsTasks } from '@/api/me'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'

/* v42 积分任务中心：完成任务 → 领取积分（Mock；接入期接 /api/app/me/points/tasks）。 */
const router = useRouter()
const { data, loading, error, run } = useAsyncList(fetchPointsTasks)
onMounted(run)

const claiming = ref('')

async function onClaim(key: string) {
  claiming.value = key
  try {
    const res = await claimPointsTask(key)
    Toast(`已领取 +${res.points} 积分`)
    await run()
  } catch (e) {
    Toast(e instanceof Error ? e.message : '领取失败，请稍后重试')
  } finally {
    claiming.value = ''
  }
}
</script>

<template>
  <div class="page-fade-in tasks-page">
    <p class="tip">完成任务领取积分，可在积分商城兑换权益。规则见 <a class="link" @click="router.push('/mall/rules')">积分规则</a>。</p>
    <Loading v-if="loading" class="state" text="加载中…" />
    <EmptyBlock v-else-if="error" :text="error" action-text="重试" @action="run" />
    <div v-else class="list stagger">
      <p class="list-count">共 {{ (data ?? []).length }} 项任务</p>
      <article v-for="t in data" :key="t.key" class="m-card task">
        <div class="task-head">
          <h3 class="title">{{ t.title }}</h3>
          <Tag :theme="t.claimed ? 'success' : t.done ? 'warning' : 'default'" variant="light" size="medium">
            {{ t.claimed ? '已领取' : t.done ? '可领取' : '未完成' }}
          </Tag>
        </div>
        <p class="desc">{{ t.desc }}</p>
        <div class="foot">
          <span class="points">+{{ t.points }} 积分</span>
          <Button
            v-if="!t.claimed"
            size="small"
            theme="primary"
            :disabled="!t.done"
            :loading="claiming === t.key"
            @click="onClaim(t.key)"
          >
            {{ t.done ? '领取' : '未完成' }}
          </Button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.tasks-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.tip {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.link {
  color: var(--td-brand-color);
  cursor: pointer;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 15px;
}

.desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.points {
  font-size: 13px;
  font-weight: 600;
  color: var(--td-brand-color);
}
</style>
