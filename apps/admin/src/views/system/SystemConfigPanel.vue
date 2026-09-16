<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import { fetchSystemConfig, saveSystemConfig } from '@/api/systemConfig'
import type { SystemConfig } from '@/types'
import { focusFirstInvalid } from '@/utils/form'

/* 系统配置：站点信息与运行时开关（保存即生效；按端下发） */
const loading = ref(true)
const saving = ref(false)
const formRef = ref()
const meta = reactive({ updatedAt: '', updatedBy: '' })
const savedSnapshot = ref('')

const form = reactive<SystemConfig>({
  siteName: '',
  siteSlogan: '',
  registrationOpen: true,
  mallOpen: true,
  demandOpen: true,
  reservationOpen: true,
  realnameRequired: false,
  leaseExpireRemindDays: 15,
  uploadMaxSizeMb: 10,
  passwordExpireDays: 90,
  minioEnabled: false,
  minioEndpoint: '',
  minioPort: 9000,
  minioUseSsl: false,
  minioAccessKey: '',
  minioSecretKey: '',
  minioBucket: 'joinyuu',
  updatedAt: '',
  updatedBy: '',
})

onMounted(async () => {
  try {
    const conf = await fetchSystemConfig()
    Object.assign(form, conf)
    meta.updatedAt = conf.updatedAt
    meta.updatedBy = conf.updatedBy
    savedSnapshot.value = JSON.stringify(form)
  } finally {
    loading.value = false
  }
})

async function onSave() {
  const valid = await formRef.value.validate()
  if (valid !== true) return focusFirstInvalid(formRef.value)
  saving.value = true
  try {
    await saveSystemConfig({ ...form })
    const conf = await fetchSystemConfig()
    Object.assign(form, conf)
    meta.updatedAt = conf.updatedAt
    meta.updatedBy = conf.updatedBy
    savedSnapshot.value = JSON.stringify(form)
    MessagePlugin.success('系统配置已保存并生效')
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

const isDirty = computed(() => !loading.value && !!savedSnapshot.value && JSON.stringify(form) !== savedSnapshot.value)

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

window.addEventListener('beforeunload', onBeforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true
  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (value: boolean) => {
      if (settled) return
      settled = true
      dialog.destroy()
      resolve(value)
    }
    const dialog = DialogPlugin.confirm({
      header: '离开确认',
      body: '系统配置尚未保存，确认离开并放弃修改吗？',
      confirmBtn: '放弃修改并离开',
      cancelBtn: '继续编辑',
      onConfirm: () => settle(true),
      onCancel: () => settle(false),
      onClose: () => settle(false),
    })
  })
})
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
              <t-input v-model="form.siteName" clearable placeholder="如 聚屿社区…" />
            </t-form-item>
            <t-form-item label="站点标语" name="siteSlogan">
              <t-input v-model="form.siteSlogan" clearable placeholder="客户端登录页展示…" />
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
                <div class="switch-label">实名认证要求</div>
                <div class="switch-tip">开启后，未完成实名认证的用户不能发布需求或报名活动</div>
              </div>
              <t-switch v-model="form.realnameRequired" />
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
              <template #help>距到期不足该天数的租约将标记为「即将到期」并推送通知</template>
            </t-form-item>
            <t-form-item
              label="上传文件大小限制（MB）"
              name="uploadMaxSizeMb"
              :rules="[{ required: true, message: '请输入 1-100 的整数', trigger: 'submit' }]"
            >
              <t-input-number v-model="form.uploadMaxSizeMb" :min="1" :max="100" :step="1" theme="column" style="width: 200px" />
              <template #help>素材库与富文本图片上传的单文件大小上限（1-100 MB）</template>
            </t-form-item>
            <t-form-item
              label="密码有效期（天）"
              name="passwordExpireDays"
              :rules="[{ required: true, message: '请输入 0-3650 的整数', trigger: 'submit' }]"
            >
              <t-input-number v-model="form.passwordExpireDays" :min="0" :max="3650" :step="1" theme="column" style="width: 200px" />
              <template #help>0 表示不启用；超过有效期后登录将强制修改密码</template>
            </t-form-item>
          </div>

          <div class="section-title">MinIO 对象存储</div>
          <div class="switch-grid">
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">启用 MinIO</div>
                <div class="switch-tip">启用后素材/富文本图片上传写入 MinIO；停用则回退本地磁盘（UPLOAD_DIR）</div>
              </div>
              <t-switch v-model="form.minioEnabled" />
            </div>
          </div>
          <div v-if="form.minioEnabled" class="form-grid">
            <t-form-item
              label="Endpoint"
              name="minioEndpoint"
              :rules="[{ required: true, message: '请输入 MinIO Endpoint' }]"
            >
              <t-input v-model="form.minioEndpoint" clearable placeholder="如 127.0.0.1 / minio.example.com…" />
              <template #help>服务地址，不含协议与端口</template>
            </t-form-item>
            <t-form-item
              label="端口"
              name="minioPort"
              :rules="[{ required: true, message: '请输入 1-65535 的端口' }]"
            >
              <t-input-number v-model="form.minioPort" :min="1" :max="65535" :step="1" theme="column" style="width: 200px" />
            </t-form-item>
            <t-form-item label="使用 HTTPS" name="minioUseSsl">
              <t-switch v-model="form.minioUseSsl" />
            </t-form-item>
            <t-form-item
              label="AccessKey"
              name="minioAccessKey"
              :rules="[{ required: true, message: '请输入 AccessKey' }]"
            >
              <t-input v-model="form.minioAccessKey" clearable autocomplete="off" placeholder="MinIO 访问密钥…" />
            </t-form-item>
            <t-form-item
              label="SecretKey"
              name="minioSecretKey"
              :rules="[{ required: true, message: '请输入 SecretKey' }]"
            >
              <t-input v-model="form.minioSecretKey" type="password" clearable autocomplete="off" placeholder="MinIO 密钥…" />
            </t-form-item>
            <t-form-item
              label="Bucket"
              name="minioBucket"
              :rules="[
                { required: true, message: '请输入 Bucket 名称' },
                { pattern: /^[a-z0-9][a-z0-9.-]{1,62}$/, message: 'Bucket 名称格式不正确' },
              ]"
            >
              <t-input v-model="form.minioBucket" clearable placeholder="如 joinyuu…" />
              <template #help>小写字母/数字/点/连字符，目录不存在时自动创建</template>
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
  width: 100%;
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
