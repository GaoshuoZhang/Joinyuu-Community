<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchSystemConfig, saveSystemConfig } from '@/api/systemConfig'
import type { SystemConfig } from '@/types'

/* 系统配置：站点信息与运行时开关（保存即生效；M1 持久化并按端下发） */
const loading = ref(true)
const saving = ref(false)
const formRef = ref()
const meta = reactive({ updatedAt: '', updatedBy: '' })

const form = reactive<SystemConfig>({
  siteName: '',
  siteSlogan: '',
  registrationOpen: true,
  mallOpen: true,
  demandOpen: true,
  reservationOpen: true,
  dailyLoginPoints: false,
  leaseExpireRemindDays: 15,
  updatedAt: '',
  updatedBy: '',
})

onMounted(async () => {
  try {
    const conf = await fetchSystemConfig()
    Object.assign(form, conf)
    meta.updatedAt = conf.updatedAt
    meta.updatedBy = conf.updatedBy
  } finally {
    loading.value = false
  }
})

async function onSave() {
  const valid = await formRef.value.validate()
  if (valid !== true) return
  saving.value = true
  try {
    await saveSystemConfig({ ...form })
    const conf = await fetchSystemConfig()
    Object.assign(form, conf)
    meta.updatedAt = conf.updatedAt
    meta.updatedBy = conf.updatedBy
    MessagePlugin.success('系统配置已保存并生效')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="config-panel page-fade-in">
    <PageHeader title="系统配置" description="站点信息与运行时开关，保存后立即生效">
      <template #actions>
        <span class="config-meta">最近保存：{{ meta.updatedAt || '—' }}（{{ meta.updatedBy || '—' }}）</span>
      </template>
    </PageHeader>

    <t-loading :loading="loading" size="small">
      <t-card :bordered="true" class="config-card">
        <t-form ref="formRef" :data="form" label-align="top">
          <div class="section-title">站点信息</div>
          <div class="form-grid">
            <t-form-item label="站点名称" name="siteName" :rules="[{ required: true, message: '请输入站点名称', trigger: 'submit' }]">
              <t-input v-model="form.siteName" clearable placeholder="如 聚屿社区" />
            </t-form-item>
            <t-form-item label="站点标语" name="siteSlogan">
              <t-input v-model="form.siteSlogan" clearable placeholder="客户端登录页展示" />
            </t-form-item>
          </div>

          <div class="section-title">功能开关</div>
          <div class="switch-grid">
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">客户端注册</div>
                <div class="switch-tip">关闭后客户端暂停新用户注册</div>
              </div>
              <t-switch v-model="form.registrationOpen" />
            </div>
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">积分商城</div>
                <div class="switch-tip">关闭后客户端隐藏商城入口，已下单订单不受影响</div>
              </div>
              <t-switch v-model="form.mallOpen" />
            </div>
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">需求广场</div>
                <div class="switch-tip">关闭后客户端暂停需求提交与响应</div>
              </div>
              <t-switch v-model="form.demandOpen" />
            </div>
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">空间预约</div>
                <div class="switch-tip">关闭后客户端暂停提交新的空间预约</div>
              </div>
              <t-switch v-model="form.reservationOpen" />
            </div>
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">每日登录积分奖励</div>
                <div class="switch-tip">开启后按积分规则 daily_login 每日发放（M1 生效）</div>
              </div>
              <t-switch v-model="form.dailyLoginPoints" />
            </div>
          </div>

          <div class="section-title">运营参数</div>
          <div class="form-grid">
            <t-form-item
              label="租约临期提醒窗口（天）"
              name="leaseExpireRemindDays"
              :rules="[{ required: true, message: '请输入 1-90 的整数', trigger: 'submit' }]"
            >
              <t-input-number v-model="form.leaseExpireRemindDays" :min="1" :max="90" :step="1" theme="column" style="width: 200px" />
              <template #help>距到期不足该天数的租约将标记为「即将到期」并推送通知（M0 通知中心已内置种子提醒）</template>
            </t-form-item>
          </div>
        </t-form>
        <div class="config-footer">
          <t-button theme="primary" :loading="saving" @click="onSave">保存配置</t-button>
        </div>
      </t-card>
    </t-loading>
  </div>
</template>

<style scoped>
.config-meta {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.config-card {
  max-width: 860px;
}

.section-title {
  margin: 8px 0 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}

.switch-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-medium);
}

.switch-label {
  font-size: 14px;
  color: var(--td-text-color-primary);
}

.switch-tip {
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.config-footer {
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--td-component-border);
}
</style>
