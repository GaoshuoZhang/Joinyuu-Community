<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, CheckTag, PullDownRefresh, Search, Tabs, TabPanel, Toast } from 'tdesign-mobile-vue'
import { fetchEnterpriseList, fetchPolicies, fetchTalents } from '@/api/community'
import { useAsyncList } from '@/composables/useAsyncList'
import ListSkeleton from '@/components/ListSkeleton.vue'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityPolicy, EnterpriseRecord, TalentMember } from '@/types'
import { useAnimSuppress } from '@/composables/useAnimSuppress'
import { useAtTop } from '@/composables/useAtTop'
import { useTabSwipe } from '@/composables/useTabSwipe'
import PolicyPopup from '@/components/community/PolicyPopup.vue'
import PolicyCard from '@/components/community/PolicyCard.vue'
import TalentCardItem from '@/components/community/TalentCardItem.vue'
import EnterpriseCardItem from '@/components/community/EnterpriseCardItem.vue'
import { useRouteQuerySync } from '@/composables/useRouteQuerySync'
import { formatZhNumber } from '@/utils/format'
import { categoryColorStyle } from '@/utils/categoryColor'
import { REFRESH_LOADING_PROPS } from '@/constants/refresh'

useAnimSuppress()

/* 社区页（社区成员视角）：顶部选项卡「社区服务 / 人才库 / 企业库」，
 * 每个 tab 自带搜索；切换 tab 时重置搜索并重新拉取。数据均经 @/api/community。
 * 企业库：已发布名片点入名片；未发布名片保持不可访问。 */
const router = useRouter()
const route = useRoute()
/* v39：下拉刷新 */
const refreshing = ref(false)
/* 离顶时禁用下拉刷新：库内 isReachTop 会被截断文本等 overflow 元素误判为已到顶 */
const atTop = useAtTop()

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

function onEnterpriseUnavailable() {
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
const { data: allPolicies, error: allPoliciesError, run: runAllPolicies } = useAsyncList<CommunityPolicy[]>(() => fetchPolicies({}))
const serviceCategories = computed(() => [...new Set((allPolicies.value ?? []).map((item) => item.category))])
const selectedCategory = ref(String(route.query.category ?? ''))


onMounted(() => {
  runAllPolicies()
  /* v41：深链 ?tab=talent/enterprise 首屏加载对应数据，避免假空态 */
  if (activeTab.value === 'service') runPolicies()
  else if (activeTab.value === 'talent') runTalents()
  else runEnterprises()
})

/* v43：进入不再自动重载（下拉刷新已覆盖，避免每次进入浪费请求） */

const { startSwipe, moveSwipe, cancelSwipe } = useTabSwipe(
  () => TAB_VALUES,
  () => activeTab.value,
  (value) => (activeTab.value = value),
)

/* 实时搜索：各 tab 输入防抖 300ms 后自动检索（清空即恢复全量）
 * v38：仅在对应 Tab 激活时响应，避免切换 Tab 清空关键词时触发隐藏 Tab 的多余请求 */
let serviceTimer: number | undefined
let talentTimer: number | undefined
let enterpriseTimer: number | undefined
let applyingRouteQuery = false
watch(serviceKeyword, () => {
  if (applyingRouteQuery) return
  if (activeTab.value !== 'service') return
  window.clearTimeout(serviceTimer)
  serviceTimer = window.setTimeout(() => {
    syncQuery()
    runPolicies()
  }, 300)
})
watch(selectedCategory, () => {
  if (applyingRouteQuery) return
  if (activeTab.value !== 'service') return
  syncQuery()
  runPolicies()
})
watch(talentKeyword, () => {
  if (applyingRouteQuery) return
  if (activeTab.value !== 'talent') return
  window.clearTimeout(talentTimer)
  talentTimer = window.setTimeout(() => {
    syncQuery()
    runTalents()
  }, 300)
})
watch(enterpriseKeyword, () => {
  if (applyingRouteQuery) return
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
  if (applyingRouteQuery) return
  if (tab === 'service') {
    serviceKeyword.value = ''
    runPolicies()
  } else if (tab === 'talent') {
    selectedCategory.value = ''
    talentKeyword.value = ''
    runTalents()
  } else {
    selectedCategory.value = ''
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

/* 关闭弹层时清掉 ?policy=，否则后续政策列表刷新会被 watch 重新弹出 */
function onPolicyVisibleChange(visible: boolean) {
  policyVisible.value = visible
  if (!visible && route.query.policy) {
    const rest = { ...route.query }
    delete rest.policy
    void router.replace({ query: rest })
  }
}

function clearServiceFilters() {
  serviceKeyword.value = ''
  selectedCategory.value = ''
}

function clearTalentFilter() {
  talentKeyword.value = ''
}

function clearEnterpriseFilter() {
  enterpriseKeyword.value = ''
}

useRouteQuerySync('/community', (query) => {
  const nextTab = TAB_VALUES.includes(query.tab ?? '') ? String(query.tab) : 'service'
  const nextKeyword = query.q ?? ''
  const nextCategory = nextTab === 'service' ? query.category ?? '' : ''
  const currentKeyword = nextTab === 'service'
    ? serviceKeyword.value
    : nextTab === 'talent'
      ? talentKeyword.value
      : enterpriseKeyword.value
  const policy = (policies.value ?? []).find((item) => item.id === query.policy)
  if (policy) openPolicy(policy)
  else if (!query.policy) {
    policyVisible.value = false
    currentPolicy.value = null
  }
  if (nextTab === activeTab.value && nextKeyword === currentKeyword && nextCategory === selectedCategory.value) return

  window.clearTimeout(serviceTimer)
  window.clearTimeout(talentTimer)
  window.clearTimeout(enterpriseTimer)
  applyingRouteQuery = true
  activeTab.value = nextTab
  if (nextTab === 'service') {
    serviceKeyword.value = nextKeyword
    selectedCategory.value = nextCategory
    runPolicies()
  } else if (nextTab === 'talent') {
    selectedCategory.value = ''
    talentKeyword.value = nextKeyword
    runTalents()
  } else {
    selectedCategory.value = ''
    enterpriseKeyword.value = nextKeyword
    runEnterprises()
  }
  void nextTick(() => {
    applyingRouteQuery = false
  })
})

watch(
  () => route.query.policy,
  () => {
    if (!route.query.policy) {
      policyVisible.value = false
      currentPolicy.value = null
      return
    }
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
  <PullDownRefresh class="community-refresh" :value="refreshing" :disabled="!atTop" :loading-props="REFRESH_LOADING_PROPS" @refresh="onRefresh">
  <div
    class="m-community page-fade-in"
    @touchstart="startSwipe"
    @touchmove="moveSwipe"
    @touchend="cancelSwipe"
    @touchcancel="cancelSwipe"
  >
    <Tabs :data-tab-values="JSON.stringify(['service', 'talent', 'enterprise'])" v-model="activeTab" class="top-tabs" :swipeable="false">
      <!-- 社区服务：政策/指引列表 -->
      <TabPanel data-tab-value="service" value="service" label="社区服务">
        <Search v-model="serviceKeyword" class="tab-search" placeholder="搜索政策关键词…" />

        <div v-if="serviceCategories.length" class="service-categories">
          <CheckTag size="medium" variant="light" :checked="!selectedCategory" @change="selectedCategory = ''">全部</CheckTag>
          <CheckTag
            v-for="category in serviceCategories"
            :key="category"
            size="medium"
            variant="light"
            :checked="selectedCategory === category"
            :style="selectedCategory === category ? categoryColorStyle(category) : undefined"
            @change="selectedCategory = category"
          >{{ category }}</CheckTag>
        </div>
        <!-- 分类字典加载失败不再静默：给出可重试提示（列表仍可浏览，仅缺分类筛选） -->
        <p v-else-if="allPoliciesError" class="categories-error">
          分类加载失败
          <Button size="small" variant="text" theme="primary" @click="runAllPolicies">重试</Button>
        </p>

        <ListSkeleton v-if="policiesLoading && !(policies ?? []).length" />
        <EmptyBlock v-else-if="policiesError" :text="policiesError" action-text="重试" @action="runPolicies" />
        <EmptyBlock
          v-else-if="(policies ?? []).length === 0"
          text="暂无相关政策"
          :action-text="serviceKeyword || selectedCategory ? '清除筛选' : undefined"
          @action="clearServiceFilters"
        />
        <template v-else>
          <template v-if="(policies ?? []).length">
            <div class="service-section-head"><h2>服务指引</h2><span class="list-count">{{ formatZhNumber(policies?.length ?? 0) }} 条内容</span></div>
            <div class="list stagger">
              <PolicyCard v-for="p in policies" :key="p.id" :policy="p" @open="openPolicy(p)" />
            </div>
          </template>
        </template>
      </TabPanel>

      <!-- 人才库：社区个体卡片 -->
      <TabPanel data-tab-value="talent" value="talent" label="人才库">
        <Search v-model="talentKeyword" class="tab-search" placeholder="搜索人才关键词…" />

        <ListSkeleton v-if="talentsLoading && !(talents ?? []).length" />
        <EmptyBlock v-else-if="talentsError" :text="talentsError" action-text="重试" @action="runTalents" />
        <EmptyBlock
          v-else-if="(talents ?? []).length === 0"
          text="暂无匹配人才"
          :action-text="talentKeyword ? '清除搜索' : undefined"
          @action="clearTalentFilter"
        />
        <div v-else class="list stagger">
          <p class="list-count">共 {{ formatZhNumber(talents?.length ?? 0) }} 位人才</p>
          <TalentCardItem v-for="t in talents" :key="t.uid" :talent="t" :to="`/talents/${t.uid}`" />
        </div>
      </TabPanel>

      <!-- 企业库：企业卡片 -->
      <TabPanel data-tab-value="enterprise" value="enterprise" label="企业库">
        <Search v-model="enterpriseKeyword" class="tab-search" placeholder="搜索企业关键词…" />

        <ListSkeleton v-if="enterprisesLoading && !(enterprises ?? []).length" />
        <EmptyBlock v-else-if="enterprisesError" :text="enterprisesError" action-text="重试" @action="runEnterprises" />
        <EmptyBlock
          v-else-if="(enterprises ?? []).length === 0"
          text="暂无企业数据"
          :action-text="enterpriseKeyword ? '清除搜索' : undefined"
          @action="clearEnterpriseFilter"
        />
        <div v-else class="list stagger">
          <p class="list-count">共 {{ formatZhNumber(enterprises?.length ?? 0) }} 家企业</p>
          <EnterpriseCardItem
            v-for="e in enterprises"
            :key="e.id"
            :enterprise="e"
            :to="`/enterprises/${e.id}`"
            @unavailable="onEnterpriseUnavailable"
          />
        </div>
      </TabPanel>
    </Tabs>

    <PolicyPopup :visible="policyVisible" :policy="currentPolicy" @update:visible="onPolicyVisibleChange" />
  </div>
  </PullDownRefresh>
</template>

<style scoped>
/* 整页下拉刷新：组件根默认 height:100% + overflow:hidden，而下拉时内容整体被 translateY 下移、
 * 容器高度并不会跟着变长——内容底部会被容器边界裁掉（列表为空时最明显，底部控件点不到）。
 * 改为内容驱动高度并允许溢出（与首页/「我的」「我的消息」同口径）。 */
.community-refresh {
  height: auto;
  min-height: 100%;
  overflow: visible;
}

.community-refresh :deep(.t-pull-down-refresh__track) {
  height: auto;
}

.m-community {
  padding:var(--app-space-8);
  display: flex;
  flex-direction: column;
  gap:var(--app-space-6);
}

.top-tabs {
  /* 标题条白底（区别于页面灰底，可见可点），内容卡片保留白底 */
  --td-tab-nav-background: var(--td-bg-color-container);
  --td-tabs-track-color: var(--td-brand-color);
}

.tab-search {
  /* 与选项卡标题条拉开间距（v46 合并原先重复声明的两条规则，上下同值 12px，布局不变） */
  margin: var(--app-space-6) 0;
}

.service-categories {
  display: flex;
  gap:var(--app-space-4);
  margin:0 0 var(--app-space-6);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  touch-action: pan-x;
}

.service-categories::-webkit-scrollbar { display: none; }

.service-categories :deep(.t-tag) { flex: 0 0 auto; }

.categories-error {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  margin: 0 0 var(--app-space-6);
  font: var(--app-type-caption);
  color: var(--td-text-color-secondary);
}

.service-section-head { display: flex; align-items: baseline; justify-content: space-between; margin:0 var(--app-space-1) var(--app-space-4); }
/* v45：区块标题统一为 section 角色档（18px 层级），与首页「最新需求/最新资讯」口径一致；计数改用次级文字色 */
.service-section-head h2 { margin:0; font: var(--app-type-section); }
/* v46：计数统一走全局 .list-count（与人才库/企业库列表口径一致），不再单独定义 span 样式 */

.list {
  display: flex;
  flex-direction: column;
  gap:var(--app-space-5);
}

/* 政策正文弹层 */
</style>
