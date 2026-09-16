<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Popup, PullDownRefresh, Search, Tabs, TabPanel, Tag, Toast, Avatar } from 'tdesign-mobile-vue'
import { fetchEnterpriseList, fetchPolicies, fetchTalents } from '@/api/community'
import { useAsyncList } from '@/composables/useAsyncList'
import ListSkeleton from '@/components/ListSkeleton.vue'
import { useAuthStore } from '@/stores/auth'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityPolicy, EnterpriseRecord, TalentMember } from '@/types'
import { useAnimSuppress } from '@/composables/useAnimSuppress'

useAnimSuppress()

/* 社区页（社区管理者视角）：顶部选项卡「社区服务 / 人才库 / 企业库」，
 * 每个 tab 自带搜索；切换 tab 时重置搜索并重新拉取。数据均经 @/api/community。
 * 企业库：已发布名片点入名片；成员对待发布名片可直达申请；其余提示未发布。 */
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

function canApplyShowcase(e: EnterpriseRecord) {
  return e.showcaseStatus !== 'published' && auth.isLogged && e.members.some((m) => m.name === auth.name)
}

/* v39：下拉刷新 */
const refreshing = ref(false)

async function onRefresh() {
  refreshing.value = true
  try {
    await Promise.all([runPolicies(), runTalents(), runEnterprises()])
  } finally {
    setTimeout(() => {
      refreshing.value = false
    }, 300)
  }
}

function onEnterpriseTap(e: EnterpriseRecord) {
  if (e.showcaseStatus === 'published') {
    void router.push(`/enterprises/${e.id}`)
    return
  }
  if (canApplyShowcase(e)) {
    void router.push(`/enterprises/${e.id}/showcase-apply`)
    return
  }
  Toast('该企业名片尚未发布')
}

const TAB_VALUES = ['service', 'talent', 'enterprise']
const initialTab = String(route.query.tab ?? 'service')
const activeTab = ref(TAB_VALUES.includes(initialTab) ? initialTab : 'service')
const initialQ = String(route.query.q ?? '')
const serviceKeyword = ref(activeTab.value === 'service' ? initialQ : '')
const talentKeyword = ref(activeTab.value === 'talent' ? initialQ : '')
const enterpriseKeyword = ref(activeTab.value === 'enterprise' ? initialQ : '')

/* v40：Tab/关键词/分类同步 URL（保留分享深链 policy） */
function syncQuery() {
  const keyword = activeTab.value === 'service' ? serviceKeyword.value : activeTab.value === 'talent' ? talentKeyword.value : enterpriseKeyword.value
  const query: Record<string, string> = { tab: activeTab.value }
  if (keyword.trim()) query.q = keyword.trim()
  if (activeTab.value === 'service' && selectedCategory.value) query.category = selectedCategory.value
  const current = route.query as Record<string, string>
  if (current.policy) query.policy = current.policy
  if (current.tab === query.tab && current.q === query.q && current.category === query.category) return
  void router.replace({ query })
}

const { data: policies, loading: policiesLoading, error: policiesError, run: runPolicies } = useAsyncList<CommunityPolicy[]>(
  () => fetchPolicies({ keyword: serviceKeyword.value.trim() || undefined, category: selectedCategory.value || undefined }),
)
const { data: talents, loading: talentsLoading, error: talentsError, run: runTalents } = useAsyncList<TalentMember[]>(
  () => fetchTalents({ keyword: talentKeyword.value.trim() || undefined }),
)
const { data: enterprises, loading: enterprisesLoading, error: enterprisesError, run: runEnterprises } =
  useAsyncList<EnterpriseRecord[]>(() =>
    fetchEnterpriseList({ keyword: enterpriseKeyword.value.trim() || undefined }),
  )

/* v41：分类选项基于全量政策，避免选中后其余分类消失 */
const { data: allPolicies, run: runAllPolicies } = useAsyncList<CommunityPolicy[]>(() => fetchPolicies({}))
const serviceCategories = computed(() => [...new Set((allPolicies.value ?? []).map((item) => item.category))])
const selectedCategory = ref(String(route.query.category ?? ''))
const featuredPolicy = computed(() => (policies.value ?? [])[0])

onMounted(() => {
  runAllPolicies()
  /* v41：深链 ?tab=talent/enterprise 首屏加载对应数据，避免假空态 */
  if (activeTab.value === 'service') runPolicies()
  else if (activeTab.value === 'talent') runTalents()
  else runEnterprises()
})

/* v43：进入不再自动重载（下拉刷新已覆盖，避免每次进入浪费请求） */

/* v43：自研滑动切换（TDesign 1.16.2 原生滑动会连续跳项）——每次手势只切换一格 */
let swipe: { identifier: number; x: number; y: number; index: number; switched: boolean } | null = null

function cancelSwipe() {
  swipe = null
}

function startSwipe(event: TouchEvent) {
  cancelSwipe()
  const target = event.target
  if (event.touches.length !== 1 || !(target instanceof Element)) return
  if (!target.closest('.t-tabs__content') || target.closest('.chips, input, textarea')) return
  const touch = event.touches[0]
  swipe = {
    identifier: touch.identifier,
    x: touch.clientX,
    y: touch.clientY,
    index: TAB_VALUES.indexOf(activeTab.value),
    switched: false,
  }
}

function moveSwipe(event: TouchEvent) {
  if (!swipe || swipe.switched) return
  if (event.touches.length !== 1) return cancelSwipe()
  const touch = event.touches[0]
  const dx = touch.clientX - swipe.x
  const dy = touch.clientY - swipe.y
  if (Math.abs(dx) <= Math.abs(dy)) return
  if (event.cancelable) event.preventDefault()
  if (Math.abs(dx) < 40) return
  const next = TAB_VALUES[swipe.index + (dx < 0 ? 1 : -1)]
  if (!next) return
  activeTab.value = next
  swipe.switched = true
}

/* 实时搜索：各 tab 输入防抖 300ms 后自动检索（清空即恢复全量）
 * v38：仅在对应 Tab 激活时响应，避免切换 Tab 清空关键词时触发隐藏 Tab 的多余请求 */
let serviceTimer: number | undefined
let talentTimer: number | undefined
let enterpriseTimer: number | undefined
watch(serviceKeyword, () => {
  if (activeTab.value !== 'service') return
  window.clearTimeout(serviceTimer)
  serviceTimer = window.setTimeout(() => {
    syncQuery()
    runPolicies()
  }, 300)
})
watch(selectedCategory, () => {
  if (activeTab.value !== 'service') return
  syncQuery()
  runPolicies()
})
watch(talentKeyword, () => {
  if (activeTab.value !== 'talent') return
  window.clearTimeout(talentTimer)
  talentTimer = window.setTimeout(() => {
    syncQuery()
    runTalents()
  }, 300)
})
watch(enterpriseKeyword, () => {
  if (activeTab.value !== 'enterprise') return
  window.clearTimeout(enterpriseTimer)
  enterpriseTimer = window.setTimeout(() => {
    syncQuery()
    runEnterprises()
  }, 300)
})
onBeforeUnmount(() => {
  window.clearTimeout(serviceTimer)
  window.clearTimeout(talentTimer)
  window.clearTimeout(enterpriseTimer)
})

watch(activeTab, (tab) => {
  if (tab === 'service') {
    serviceKeyword.value = ''
    runPolicies()
  } else if (tab === 'talent') {
    talentKeyword.value = ''
    runTalents()
  } else {
    enterpriseKeyword.value = ''
    runEnterprises()
  }
  syncQuery()
})

/* 政策正文展示（Popup 弹层） */
const policyVisible = ref(false)
const currentPolicy = ref<CommunityPolicy | null>(null)
function openPolicy(p: CommunityPolicy) {
  currentPolicy.value = p
  policyVisible.value = true
}

/* v42：跳转我的服务申请并按 query 打开办理表单 */
function onApplyPolicy() {
  const policy = currentPolicy.value
  if (!policy) return
  policyVisible.value = false
  void router.push({ path: '/me/services', query: { apply: policy.id, title: policy.title } })
}

watch(
  () => [route.query.tab, route.query.policy],
  () => {
    if (route.query.tab === 'service') activeTab.value = 'service'
    const policy = (policies.value ?? []).find((item) => item.id === route.query.policy)
    if (policy) openPolicy(policy)
  },
)
watch(policies, () => {
  const policy = (policies.value ?? []).find((item) => item.id === route.query.policy)
  if (policy) openPolicy(policy)
})
</script>

<template>
  <PullDownRefresh :value="refreshing" @refresh="onRefresh">
  <div
    class="m-community page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <Tabs v-model="activeTab" class="top-tabs" :swipeable="false">
      <!-- 社区服务：政策/指引列表 -->
      <TabPanel value="service" label="社区服务">
        <Search v-model="serviceKeyword" class="tab-search" placeholder="搜索政策关键词" />

        <div v-if="serviceCategories.length" class="service-categories">
          <Tag size="small" variant="light" :theme="selectedCategory ? 'default' : 'primary'" @click="selectedCategory = ''">全部</Tag>
          <Tag v-for="category in serviceCategories" :key="category" size="small" variant="light" :theme="selectedCategory === category ? 'primary' : 'default'" @click="selectedCategory = category">{{ category }}</Tag>
        </div>

        <ListSkeleton v-if="policiesLoading && !(policies ?? []).length" />
        <EmptyBlock v-else-if="policiesError" :text="policiesError" action-text="重试" @action="runPolicies" />
        <EmptyBlock v-else-if="(policies ?? []).length === 0" text="暂无相关政策" />
        <template v-else>
          <article v-if="featuredPolicy" class="service-feature m-card pressable" v-pressable @click="openPolicy(featuredPolicy)">
            <span class="eyebrow">社区服务精选</span>
            <h2>{{ featuredPolicy.title }}</h2>
            <p>{{ featuredPolicy.summary }}</p>
            <span class="service-link">查看服务详情 ›</span>
          </article>
          <div class="service-section-head"><h2>服务指引</h2><span>{{ policies?.length ?? 0 }} 条内容</span></div>
        <div class="list stagger">
          <article
            v-for="p in policies"
            :key="p.id"
            class="policy-card m-card" v-pressable
            @click="openPolicy(p)"
          >
            <div class="row-head">
              <span class="cat-tag">{{ p.category }}</span>
              <span class="updated">更新 {{ p.updatedAt }}</span>
            </div>
            <h3 class="title">{{ p.title }}</h3>
            <p class="summary">{{ p.summary }}</p>
          </article>
        </div>
        </template>
      </TabPanel>

      <!-- 人才库：社区个体卡片 -->
      <TabPanel value="talent" label="人才库">
        <Search v-model="talentKeyword" class="tab-search" placeholder="搜索人才关键词" />

        <ListSkeleton v-if="talentsLoading && !(talents ?? []).length" />
        <EmptyBlock v-else-if="talentsError" :text="talentsError" action-text="重试" @action="runTalents" />
        <EmptyBlock v-else-if="(talents ?? []).length === 0" text="暂无匹配人才" />
        <div v-else class="list stagger">
          <p class="list-count">共 {{ talents?.length ?? 0 }} 位人才</p>
          <article v-for="t in talents" :key="t.uid" class="talent-card m-card" v-pressable @click="router.push(`/talents/${t.uid}`)">
            <div class="row-head">
              <span class="talent-name">
                <Avatar size="40px" :image="t.avatar" class="talent-avatar">{{ t.name.slice(0, 1) }}</Avatar>
                <h3 class="title name">{{ t.name }}</h3>
              </span>
              <span class="role-tag">{{ t.role }}</span>
            </div>
            <p class="intro">{{ t.intro }}</p>
            <div v-if="t.skills.length" class="skills">
              <Tag v-for="s in t.skills" :key="s" size="small" variant="light" theme="default" class="skill">
                {{ s }}
              </Tag>
            </div>
          </article>
        </div>
      </TabPanel>

      <!-- 企业库：企业卡片 -->
      <TabPanel value="enterprise" label="企业库">
        <Search v-model="enterpriseKeyword" class="tab-search" placeholder="搜索企业关键词" />

        <ListSkeleton v-if="enterprisesLoading && !(enterprises ?? []).length" />
        <EmptyBlock v-else-if="enterprisesError" :text="enterprisesError" action-text="重试" @action="runEnterprises" />
        <EmptyBlock v-else-if="(enterprises ?? []).length === 0" text="暂无企业数据" />
        <div v-else class="list stagger">
          <p class="list-count">共 {{ enterprises?.length ?? 0 }} 家企业</p>
          <article
            v-for="e in enterprises"
            :key="e.id"
            class="enterprise-card m-card" v-pressable
            @click="onEnterpriseTap(e)"
          >
            <div class="row-head">
              <h3 class="title name">{{ e.name }}</h3>
              <span v-if="e.showcaseStatus === 'published'" class="showcase-tag">入驻展示</span>
              <span v-else-if="canApplyShowcase(e)" class="apply-tag">申请企业名片 ›</span>
              <span v-else class="unpublished-tag">企业名片未发布</span>
            </div>
            <p class="meta">{{ e.industry }} · {{ e.size }}</p>
            <p class="intro">{{ e.description }}</p>
          </article>
        </div>
      </TabPanel>
    </Tabs>

    <!-- 政策正文弹层 -->
    <Popup v-model:visible="policyVisible" placement="bottom" class="policy-pop">
      <div v-if="currentPolicy" class="pop-body">
        <span class="cat-tag">{{ currentPolicy.category }}</span>
        <h3 class="p-title">{{ currentPolicy.title }}</h3>
        <p class="p-summary">{{ currentPolicy.summary }}</p>
        <p class="p-content">{{ currentPolicy.content }}</p>
        <div v-if="currentPolicy.version || currentPolicy.effectiveAt || currentPolicy.publisher" class="p-meta">
          <span v-if="currentPolicy.version">版本：{{ currentPolicy.version }}</span>
          <span v-if="currentPolicy.effectiveAt">生效日期：{{ currentPolicy.effectiveAt }}</span>
          <span v-if="currentPolicy.publisher">发布主体：{{ currentPolicy.publisher }}</span>
        </div>
        <div v-if="currentPolicy.attachments?.length" class="p-files">
          <a v-for="file in currentPolicy.attachments" :key="file.url" :href="file.url" target="_blank" rel="noopener">{{ file.name }}</a>
        </div>
        <p class="p-updated">更新时间：{{ currentPolicy.updatedAt }}</p>
        <Button v-if="currentPolicy" theme="primary" block @click="onApplyPolicy">在线申请</Button>
        <Button variant="outline" block @click="policyVisible = false">关闭</Button>
      </div>
    </Popup>
  </div>
  </PullDownRefresh>
</template>

<style scoped>
.m-community {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.top-tabs {
  /* 标题条白底（区别于页面灰底，可见可点），内容卡片保留白底 */
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-search {
  /* 与选项卡标题条拉开间距 */
  margin-top: 12px;
  margin-bottom: 12px;
}

.service-categories {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.service-categories::-webkit-scrollbar { display: none; }

.service-categories :deep(.t-tag) { flex: 0 0 auto; }

.service-feature {
  position: relative;
  margin-bottom: 16px;
  overflow: hidden;
  cursor: pointer;
}

.service-feature::after {
  position: absolute;
  top: -34px;
  right: -22px;
  width: 96px;
  height: 96px;
  border: 1px solid var(--td-brand-color-3);
  border-radius: var(--td-radius-circle);
  content: '';
}

.service-feature .eyebrow { color: var(--td-brand-color); font-size: 12px; font-weight: 600; }
.service-feature h2 { position: relative; z-index: 1; margin: 8px 0; font-size: 17px; line-height: 1.45; }
.service-feature p { position: relative; z-index: 1; display: -webkit-box; overflow: hidden; margin: 0; color: var(--td-text-color-secondary); font-size: 12px; line-height: 1.7; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.service-link { display: inline-block; margin-top: 12px; color: var(--td-brand-color); font-size: 12px; font-weight: 600; }

.service-section-head { display: flex; align-items: baseline; justify-content: space-between; margin: 0 2px 8px; }
.service-section-head h2 { margin: 0; font-size: 15px; }
.service-section-head span { color: var(--td-text-color-placeholder); font-size: 12px; }

.state {
  padding: 20px 0;
}

.tab-search {
  margin-bottom: 10px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.policy-card,
.talent-card,
.enterprise-card {
  cursor: pointer;
}

.row-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.talent-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.talent-avatar {
  flex-shrink: 0;
  font-size: 16px;
}

.cat-tag,
.role-tag,
.showcase-tag {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: var(--td-radius-small);
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.showcase-tag {
  background: var(--td-success-color-light);
  color: var(--td-success-color);
}

.apply-tag {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--td-brand-color);
}

.unpublished-tag {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.updated,
.meta {
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.title {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  min-width: 0;
}

.name {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.summary,
.intro {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.skill {
  margin: 0;
}

/* 政策正文弹层 */
.policy-pop {
  display: flex;
}

.pop-body {
  box-sizing: border-box;
  width: 100%;
  max-height: 70vh;
  overflow-y: auto;
  padding: 18px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-large) var(--td-radius-large) 0 0;
}

.pop-body .p-title {
  margin: 0;
  font-size: 17px;
  line-height: 1.5;
  color: var(--td-text-color-primary);
}

.pop-body .p-summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
}

.pop-body .p-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--td-text-color-primary);
  white-space: pre-wrap;
}

.pop-body .p-updated {
  margin: 0;
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}

.pop-body .p-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 10px 0 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.pop-body .p-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
}

.pop-body .p-files a {
  color: var(--td-brand-color);
}
</style>
