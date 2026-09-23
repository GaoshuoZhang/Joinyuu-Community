<script setup lang="ts">
import { Button, Icon } from 'tdesign-mobile-vue'
import type { CommunityEvent } from '@/types'

/* 报名操作区：按报名态分流（待审核/已通过/候补/被驳回/未报名），
 * 统一悬浮固定在详情页底部，避免主操作脱离拇指区；页面内容区需为其预留底部空间。 */
defineProps<{
  event: CommunityEvent
  myStatus?: string
  myCheckedIn: boolean
  loggedIn: boolean
  acting: boolean
  cancelBlocked: boolean
  disableReason: string
  enrollForbidden: boolean
}>()

const emit = defineEmits<{
  enroll: []
  cancel: []
  checkIn: []
}>()
</script>

<template>
  <Teleport to="body">
    <div class="event-enrollment-bar" role="group" aria-label="报名操作">
      <template v-if="myStatus === 'pending'">
        <p class="bar-line">审核结果将通过站内信通知</p>
        <Button v-if="!myCheckedIn && !cancelBlocked" theme="default" variant="outline" block :disabled="acting" @click="emit('cancel')">取消报名</Button>
        <p v-else-if="!myCheckedIn" class="bar-hint">
          距活动开始不足 24 小时，如需取消<template v-if="loggedIn">可<router-link class="bar-link" to="/me/messages">给社区留言</router-link>协助处理</template>
          <template v-else>请联系社区运营</template>
        </p>
      </template>

      <template v-else-if="myStatus === 'approved'">
        <p v-if="myCheckedIn" class="bar-line ok"><Icon aria-hidden="true" name="check-circle" size="16px" />已签到</p>
        <p v-else class="bar-line">记得准时参加</p>
        <Button v-if="!myCheckedIn" theme="primary" block :disabled="acting" @click="emit('checkIn')">签到</Button>
        <Button v-if="!cancelBlocked" theme="default" variant="outline" block :disabled="acting" @click="emit('cancel')">取消报名</Button>
        <p v-else class="bar-hint">
          距活动开始不足 24 小时，如需取消<template v-if="loggedIn">可<router-link class="bar-link" to="/me/messages">给社区留言</router-link>协助处理</template>
          <template v-else>请联系社区运营</template>
        </p>
      </template>

      <template v-else-if="myStatus === 'waitlisted'">
        <p class="bar-line">有空位时将按顺序自动递补并通知你</p>
        <Button theme="default" variant="outline" block :disabled="acting" @click="emit('cancel')">退出候补</Button>
      </template>

      <template v-else-if="myStatus === 'rejected'">
        <p class="bar-line">可调整报名条件后重新提交</p>
        <p v-if="event.myEnrollmentRejectReason" class="bar-reason">原因：{{ event.myEnrollmentRejectReason }}</p>
        <Button v-if="event.enrollmentOpen === false" theme="primary" block disabled>报名未开放</Button>
        <Button v-else-if="enrollForbidden" theme="primary" block disabled>当前身份无报名权限</Button>
        <Button v-else-if="!disableReason" theme="primary" block :disabled="acting" @click="emit('enroll')">重新报名</Button>
        <p v-else class="bar-reason">{{ disableReason }}</p>
      </template>

      <template v-else>
        <p v-if="loggedIn && disableReason && !enrollForbidden" class="bar-reason">{{ disableReason }}</p>
        <p v-else-if="event.requireReview" class="bar-hint">该活动报名需审核，提交后待管理员通过；满员时将进入候补。</p>
        <p v-else class="bar-hint">满员时将自动进入候补队列。</p>
        <Button v-if="event.enrollmentOpen === false" theme="primary" block disabled>报名未开放</Button>
        <Button v-else-if="!loggedIn" theme="primary" block @click="emit('enroll')">登录后报名</Button>
        <Button v-else theme="primary" block :disabled="acting || !!disableReason" @click="emit('enroll')">
          {{ acting ? '报名中…' : enrollForbidden ? '当前身份无报名权限' : '立即报名' }}
        </Button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.event-enrollment-bar {
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
  box-shadow: var(--app-action-bar-shadow);
}

.bar-line {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--app-space-4);
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.bar-line.ok {
  color: var(--td-success-color);
}

.bar-hint {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
  line-height: 1.6;
}

/* 留言入口：文字链形态，内联在提示文案中 */
.bar-link {
  color: var(--td-brand-color);
}

.bar-reason {
  margin: 0;
  font-size: var(--app-font-caption);
  color: var(--td-error-color);
  line-height: 1.6;
}
</style>
