<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Icon, Toast } from 'tdesign-mobile-vue'

/* 企业合作 hub（/intros/enterprise）：两种合作方式对比与选择，CTA 进入对应申请表单。
 * 企业入驻 → 需办公空间，对应后台「社区企业」；合作伙伴 → 无需入驻，对应「合作企业」。 */
const router = useRouter()

const options = [
  {
    key: 'settle',
    title: '企业入驻',
    tagline: '在社区拥有办公空间，成为「社区企业」',
    icon: 'building',
    points: [
      '获得办公位 / 独立办公室与办公空间资源',
      '以企业身份发布需求、优先预约共享空间',
      '可申请企业名片，参与路演与闭门会',
      '适合需要在社区常驻办公的创业团队',
    ],
    intro: '/intros/settle',
    form: '/applications/settle',
  },
  {
    key: 'cooperation',
    title: '合作伙伴',
    tagline: '无需入驻办公，以「合作企业」身份联动',
    icon: 'usergroup',
    points: [
      '以项目制 / 资源合作方式参与社区共建',
      '优先对接社区企业与项目资源',
      '品牌联合曝光（可申请企业名片）',
      '适合投资机构、服务机构、高校院所等',
    ],
    intro: '/intros/cooperation',
    form: '/applications/cooperation',
  },
] as const

const selected = ref('')
const ctaLabel = computed(() =>
  selected.value === 'settle' ? '成为社区企业' : selected.value === 'cooperation' ? '成为合作伙伴' : '请选择合作方式',
)

function onConfirm() {
  const opt = options.find((o) => o.key === selected.value)
  if (!opt) {
    Toast('请先选择合作方式')
    return
  }
  void router.push(opt.form)
}
</script>

<template>
  <div class="page-fade-in coop-hub has-fixed-actions">
    <header class="head">
      <p class="title">企业合作</p>
      <p class="subtitle">两种合作方式，选择适合你的路径</p>
    </header>

    <!-- v49：整卡可选（参考发布需求页）——卡片主体为原生 button，指示器用非交互 Icon，
         「了解详细流程」链接作为 button 的兄弟节点，避免可交互元素嵌套；选中态切换背景与描边 -->
    <article v-for="opt in options" :key="opt.key" class="m-card option" :class="{ active: selected === opt.key }">
      <button
        type="button"
        class="option-select"
        :aria-pressed="selected === opt.key"
        :aria-label="`选择${opt.title}`"
        @click="selected = opt.key"
      >
        <div class="opt-head">
          <span class="opt-icon"><Icon aria-hidden="true" :name="opt.icon" size="20px" /></span>
          <div class="opt-title-wrap">
            <h2 class="opt-title">{{ opt.title }}</h2>
            <p class="opt-tagline">{{ opt.tagline }}</p>
          </div>
          <Icon
            aria-hidden="true"
            class="opt-mark"
            :name="selected === opt.key ? 'check-circle-filled' : 'circle'"
            size="24px"
          />
        </div>
        <ul class="points">
          <li v-for="(p, i) in opt.points" :key="i">{{ p }}</li>
        </ul>
      </button>
      <router-link class="intro-link" :to="opt.intro">了解详细流程 <Icon aria-hidden="true" name="chevron-right" size="14px" /></router-link>
    </article>

    <Button theme="primary" variant="text" block @click="router.push('/me/applications')">
      查看申请记录
      <template #suffix><Icon aria-hidden="true" name="chevron-right" size="14px" /></template>
    </Button>

    <Teleport to="body">
      <div class="mobile-fixed-action-bar coop-actions">
        <Button theme="primary" size="large" block :disabled="!selected" @click="onConfirm">{{ ctaLabel }}</Button>
        <p class="tip">提交后由社区运营审核（约 3 个工作日），结果将站内信通知</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.coop-hub {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.coop-hub.has-fixed-actions {
  /* v46：底部固定操作栏净空统一走共享变量，避免页面写死 112px */
  padding-bottom: var(--app-action-bar-clearance);
}

.coop-actions {
  background: var(--td-bg-color-container);
  border-top: 1px solid var(--td-component-border);
  box-shadow: var(--app-action-bar-shadow);
}

.head {
  padding:var(--app-space-2) var(--app-space-1);
}

.title {
  margin:0 0 var(--app-space-2);
  font-size: var(--app-font-title);
}

.subtitle {
  margin:0;
  font-size: var(--app-font-body);
  color: var(--td-text-color-secondary);
}

.option {
  /* 内距下沉到可点按钮，保证卡片内任意位置点击都能选中 */
  padding:0;
  border: 1px solid var(--td-component-border);
  overflow: hidden;
  transition: border-color 150ms ease, background 150ms ease;
}

.option.active {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-1);
}

.option-select {
  display: block;
  width: 100%;
  padding: var(--app-space-8);
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.option-select:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: -2px;
}

.opt-head {
  display: flex;
  align-items: center;
  gap:var(--app-space-5);
}

.opt-icon {
  /* 图标底板尺寸：集中为局部变量（36px 介于间距 token 32/40 之间，直接写数字会与刻度混淆） */
  --opt-icon-size: 36px;
  display: grid;
  place-items: center;
  width: var(--opt-icon-size);
  height: var(--opt-icon-size);
  flex-shrink: 0;
  border-radius: var(--td-radius-circle);
  color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.opt-title-wrap {
  flex: 1;
  min-width: 0;
}

.opt-title {
  margin:0 0 var(--app-space-1);
  font-size: var(--app-font-subtitle);
}

.opt-tagline {
  margin:0;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-secondary);
}

/* 选中指示器（非交互元素，选择行为由整卡按钮承担） */
.opt-mark {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
  transition: color 150ms ease;
}

.option.active .opt-mark {
  color: var(--td-brand-color);
}

.points {
  margin:var(--app-space-6) 0 0;
  padding:0 0 0 var(--app-space-9);
}

.points li {
  font-size: var(--app-font-caption);
  line-height: 1.9;
  color: var(--td-text-color-secondary);
}

.intro-link {
  display: inline-flex;
  align-items: center;
  gap:var(--app-space-1);
  margin:0 var(--app-space-8) var(--app-space-6);
  min-height: 44px;
  font-size: var(--app-font-caption);
  color: var(--td-brand-color);
  text-decoration: none;
  cursor: pointer;
}

.tip {
  margin:0;
  text-align: center;
  font-size: var(--app-font-caption);
  color: var(--td-text-color-placeholder);
}
</style>
