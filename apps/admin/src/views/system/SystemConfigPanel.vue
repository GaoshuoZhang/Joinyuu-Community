<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import PageHeader from '@/components/PageHeader.vue'
import {
  fetchRealnameCatalog,
  fetchSystemConfig,
  saveSystemConfig,
  testRealnameVerification,
} from '@/api/systemConfig'
import type { RealnameCatalog, SystemConfigPayload } from '@/api/systemConfig'
import type { SystemConfig } from '@/types'
import { focusFirstInvalid } from '@/utils/form'

/* 系统配置：站点信息与运行时开关（保存即生效；按端下发）
 * 密钥安全（P0）：MinIO SecretKey 为只写字段——服务端不回传原文，仅返回「是否已配置」与脱敏值；
 * 留空提交表示保持原值（支持只轮换其他配置），填写表示更新或轮换密钥。 */
type SystemConfigForm = SystemConfigPayload &
  Pick<SystemConfig, 'updatedAt' | 'updatedBy'> & {
    /** 表单内始终以字符串映射维护，避免可选项索引触发 TS18048 */
    realnameVerifyConfig: Record<string, string>
    realnameVerifyCredentialEnv: Record<string, string>
  }

const loading = ref(true)
const saving = ref(false)
const formRef = ref()
const savedSnapshot = ref('')

/** SecretKey 是否已配置（环境变量或数据库任一存在） */
const secretConfigured = ref(false)
/** SecretKey 脱敏展示值 */
const secretMasked = ref('')
/** 凭据来源：env 优先，其次 database */
const credentialSource = ref<'env' | 'database' | 'none'>('none')

/* ---------- P1 实名核验（权威二要素） ---------- */
const realnameCatalog = ref<RealnameCatalog>({ options: [], meta: [] })
const realnameProviderLabel = ref('')
const realnameCredentialConfigured = ref(false)
const realnameMissingCredentials = ref<string[]>([])
const realnameTestOk = ref(false)
const realnameTestedAt = ref<string | null>(null)
const realnameTesting = ref(false)
const realnameMode = ref<'verified' | 'registration'>('registration')
const realnameCredentialMasked = ref<Record<string, string>>({})

/** 当前所选供应商的元信息（参数与凭据变量名） */
const currentRealnameMeta = computed(() =>
  realnameCatalog.value.meta.find((item) => item.provider === form.realnameVerifyProvider),
)

const form = reactive<SystemConfigForm>({
  siteName: '',
  siteSlogan: '',
  registrationOpen: true,
  mallOpen: true,
  demandOpen: true,
  reservationOpen: true,
  realnameRequired: false,
  homeCarouselOpen: true,
  leaseExpireRemindDays: 15,
  uploadMaxSizeMb: 10,
  passwordExpireDays: 90,
  realnameVerifyEnabled: false,
  realnameVerifyProvider: '',
  realnameVerifyCredentialMode: 'inline',
  realnameVerifyConfig: {},
  realnameVerifyCredentialEnv: {},
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

/** 用服务端配置刷新表单，并清空只写密钥输入（避免把「已配置」误当成待提交的新值） */
function applyConfig(conf: SystemConfig) {
  const {
    minioSecretKeyConfigured,
    minioSecretKeyMasked,
    minioCredentialSource,
    realnameVerifyProviderLabel: providerLabel,
    realnameVerifyCredentialConfigured: credentialConfigured,
    realnameVerifyMissingCredentials: missingCredentials,
    realnameVerifyCredentialMasked: credentialMasked,
    realnameVerifyTestOk: testOk,
    realnameVerifyTestedAt: testedAt,
    realnameMode: mode,
    ...rest
  } = conf
  Object.assign(form, rest)
  form.minioSecretKey = ''
  secretConfigured.value = minioSecretKeyConfigured
  secretMasked.value = minioSecretKeyMasked
  credentialSource.value = minioCredentialSource
  realnameProviderLabel.value = providerLabel
  realnameCredentialConfigured.value = credentialConfigured
  realnameMissingCredentials.value = missingCredentials
  realnameCredentialMasked.value = credentialMasked ?? {}
  realnameTestOk.value = testOk
  realnameTestedAt.value = testedAt
  realnameMode.value = mode
}

/** 测试实名核验联通（接口可调用即算联通）；成功后客户端才显示「实名认证」 */
async function onTestRealname() {
  realnameTesting.value = true
  try {
    const result = await testRealnameVerification()
    MessagePlugin.success(`联通成功：${result.message}`)
  } catch (e) {
    MessagePlugin.error(e instanceof Error ? e.message : '联通测试失败')
  } finally {
    realnameTesting.value = false
    applyConfig(await fetchSystemConfig())
  }
}

/** 启用/切换供应商后清空上一供应商的参数与凭据变量名 */
function onRealnameProviderChange(provider: string) {
  form.realnameVerifyProvider = provider
  form.realnameVerifyConfig = {}
  form.realnameVerifyCredentialEnv = {}
  for (const field of realnameCatalog.value.meta.find((item) => item.provider === provider)?.credentialKeys ?? []) {
    form.realnameVerifyCredentialEnv[field.key] = ''
  }
}

/** 切换凭据来源时清空输入（inline 空值=保持原值，避免把变量名当密钥提交） */
function onRealnameCredentialModeChange(mode: 'inline' | 'env') {
  form.realnameVerifyCredentialMode = mode
  form.realnameVerifyCredentialEnv = {}
  for (const field of currentRealnameMeta.value?.credentialKeys ?? []) {
    form.realnameVerifyCredentialEnv[field.key] = ''
  }
}

function realnameCredentialLabel(field: { key: string; label: string }): string {
  return form.realnameVerifyCredentialMode === 'env' ? `${field.label}（环境变量名）` : field.label
}

function realnameCredentialPlaceholder(field: { key: string; label: string }): string {
  if (form.realnameVerifyCredentialMode === 'env') {
    return `如 REALNAME_${field.key.toUpperCase()}…`
  }
  const masked = realnameCredentialMasked.value[field.key]
  return masked ? `${masked}（留空保持不变）…` : `请输入${field.label}…`
}

/** 未配置密钥时必填；已配置时留空即保持原值 */
const secretRules = computed(() =>
  secretConfigured.value
    ? []
    : [{ required: true, message: '请输入 SecretKey', trigger: 'submit' as const }],
)

const credentialSourceLabel = computed(() => {
  if (credentialSource.value === 'env') return '由环境变量提供'
  if (credentialSource.value === 'database') return '已保存到数据库'
  return '—'
})

onMounted(async () => {
  try {
    const [conf, catalog] = await Promise.all([fetchSystemConfig(), fetchRealnameCatalog()])
    realnameCatalog.value = catalog
    applyConfig(conf)
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
    /* 密钥留空时服务端保持原值；仅在有输入时提交新密钥（轮换） */
    await saveSystemConfig({ ...form, minioSecretKey: form.minioSecretKey?.trim() ?? '' })
    applyConfig(await fetchSystemConfig())
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
        <span class="config-meta">最近保存：{{ form.updatedAt || '—' }}（{{ form.updatedBy || '—' }}）</span>
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
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">首页轮播图</div>
                <div class="switch-tip">关闭后客户端首页不展示轮播区域（与「轮播图管理」共用开关）</div>
              </div>
              <t-switch v-model="form.homeCarouselOpen" />
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

          <div class="section-title">实名核验（权威二要素）</div>
          <div class="switch-grid">
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">启用权威核验</div>
                <div class="switch-tip">
                  启用并测试联通后，客户端显示「实名认证」；未启用或未联通时显示「身份信息登记」
                </div>
              </div>
              <t-switch v-model="form.realnameVerifyEnabled" />
            </div>
          </div>
          <template v-if="form.realnameVerifyEnabled">
            <div class="form-grid">
              <t-form-item
                label="核验供应商（单选）"
                name="realnameVerifyProvider"
                :rules="[{ required: true, message: '请选择核验供应商' }]"
              >
                <t-select
                  :value="form.realnameVerifyProvider"
                  :options="realnameCatalog.options.map((item) => ({ label: item.label, value: item.provider }))"
                  @change="(value: unknown) => onRealnameProviderChange(String(value))"
                />
              </t-form-item>
              <t-form-item label="联通状态" name="realnameStatus">
                <t-space size="small">
                  <t-tag :theme="realnameTestOk ? 'success' : 'warning'" variant="light" size="small">
                    {{ realnameTestOk ? '已联通' : '未联通' }}
                  </t-tag>
                  <t-button
                    theme="primary"
                    variant="outline"
                    size="small"
                    :loading="realnameTesting"
                    @click="onTestRealname"
                  >
                    测试联通
                  </t-button>
                </t-space>
                <template #help>
                  <span v-if="realnameTestedAt">最近联通：{{ realnameTestedAt }}；配置变更后需重新测试</span>
                  <span v-else>尚未测试；配置变更后需重新测试</span>
                </template>
              </t-form-item>
            </div>
            <div v-if="currentRealnameMeta?.configFields?.length" class="form-grid">
              <t-form-item
                v-for="field in currentRealnameMeta.configFields"
                :key="field.key"
                :label="field.label"
                :name="`realnameVerifyConfig.${field.key}`"
              >
                <t-input v-model="form.realnameVerifyConfig[field.key]" clearable :placeholder="(field.hint || '') + '…'" />
                <template #help>{{ field.hint || '' }}</template>
              </t-form-item>
            </div>
            <div class="section-title">核验凭据</div>
            <div class="form-grid">
              <t-form-item label="凭据来源" name="realnameVerifyCredentialMode">
                <t-select
                  :value="form.realnameVerifyCredentialMode"
                  :options="[
                    { label: '直接填写密钥（推荐）', value: 'inline' },
                    { label: '登记环境变量名', value: 'env' },
                  ]"
                  @change="(value: unknown) => onRealnameCredentialModeChange(String(value) as 'inline' | 'env')"
                />
                <template #help>
                  {{ form.realnameVerifyCredentialMode === 'inline'
                    ? '密钥写入数据库仅供服务端调用：接口不回传、审计不记录；留空表示保持原值'
                    : '仅登记环境变量名，值由部署侧注入（大写字母开头，仅含大写字母/数字/下划线）' }}
                </template>
              </t-form-item>
              <t-form-item
                v-for="field in currentRealnameMeta?.credentialKeys ?? []"
                :key="field.key"
                :label="realnameCredentialLabel(field)"
                :name="`realnameVerifyCredentialEnv.${field.key}`"
              >
                <t-input
                  v-model="form.realnameVerifyCredentialEnv[field.key]"
                  clearable
                  autocomplete="off"
                  :placeholder="realnameCredentialPlaceholder(field)"
                />
                <template #help>
                  <span v-if="form.realnameVerifyCredentialMode === 'inline'">
                    {{ realnameCredentialMasked[field.key] ? '已配置，留空则保持不变' : '尚未配置' }}
                  </span>
                  <span v-else>环境变量名</span>
                </template>
              </t-form-item>
            </div>
            <div class="switch-row">
              <div class="switch-text">
                <div class="switch-label">
                  当前客户端文案：{{ realnameMode === 'verified' ? '实名认证' : '身份信息登记' }}
                </div>
                <div class="switch-tip">
                  <span v-if="!realnameCredentialConfigured">
                    缺少环境变量：{{ realnameMissingCredentials.join('、') || '未登记' }}
                  </span>
                  <span v-else-if="!realnameTestOk">凭据已齐备，请点击「测试联通」</span>
                  <span v-else>已联通 {{ realnameProviderLabel }}</span>
                </div>
              </div>
            </div>
          </template>

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
            <t-form-item label="SecretKey" name="minioSecretKey" :rules="secretRules">
              <t-input
                v-model="form.minioSecretKey"
                type="password"
                clearable
                autocomplete="off"
                placeholder="留空则保持不变…"
              />
              <template #help>
                <span v-if="secretConfigured">
                  当前：{{ secretMasked }}（{{ credentialSourceLabel }}）；留空表示保持不变
                </span>
                <span v-else>尚未配置；启用 MinIO 前请填写一次</span>
              </template>
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
