<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Input, Loading, Popup, Tabs, TabPanel, Tag } from 'tdesign-mobile-vue'
import { fetchEnterpriseList, fetchPolicies, fetchTalents } from '@/api/community'
import { useAsyncList } from '@/composables/useAsyncList'
import EmptyBlock from '@/components/shared/EmptyBlock.vue'
import type { CommunityPolicy, TalentMember } from '@/types'
import type { EnterpriseRecord } from '@/mock/db'

/* 社区页（社区管理者视角）：顶部选项卡「社区服务 / 人才库 / 企业库」，
 * 每个 tab 自带搜索；切换 tab 时重置搜索并重新拉取。数据均经 @/api/community。 */
const router = useRouter()

const activeTab = ref('service')
const serviceKeyword = ref('')
const talentKeyword = ref('')
const enterpriseKeyword = ref('')

const { data: policies, loading: policiesLoading, error: policiesError, run: runPolicies } = useAsyncList<CommunityPolicy[]>(
  () => fetchPolicies({ keyword: serviceKeyword.value.trim() || undefined }),
)
const { data: talents, loading: talentsLoading, error: talentsError, run: runTalents } = useAsyncList<TalentMember[]>(
  () => fetchTalents({ keyword: talentKeyword.value.trim() || undefined }),
)
const { data: enterprises, loading: enterprisesLoading, error: enterprisesError, run: runEnterprises } =
  useAsyncList<EnterpriseRecord[]>(() =>
    fetchEnterpriseList({ keyword: enterpriseKeyword.value.trim() || undefined }),
  )

onMounted(runPolicies)

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
})

/* 政策正文展示（Popup 弹层） */
const policyVisible = ref(false)
const currentPolicy = ref<CommunityPolicy | null>(null)
function openPolicy(p: CommunityPolicy) {
  currentPolicy.value = p
  policyVisible.value = true
}
</script>

<template>
  <div class="m-community page-fade-in">
    <Tabs v-model="activeTab" class="top-tabs">
      <!-- 社区服务：政策/指引列表 -->
      <TabPanel value="service" label="社区服务">
        <div class="search-row">
          <Input
            v-model="serviceKeyword"
            class="search-input"
            placeholder="搜索政策关键词…"
            clearable
            @keyup.enter="runPolicies"
          />
          <Button theme="primary" @click="runPolicies">查询</Button>
        </div>

        <Loading v-if="policiesLoading" class="state" text="加载中…" />
        <EmptyBlock v-else-if="policiesError" :text="policiesError" />
        <EmptyBlock v-else-if="(policies ?? []).length === 0" text="暂无相关政策" />
        <div v-else class="list stagger">
          <article
            v-for="p in policies"
            :key="p.id"
            class="policy-card m-card"
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
      </TabPanel>

      <!-- 人才库：社区个体卡片 -->
      <TabPanel value="talent" label="人才库">
        <div class="search-row">
          <Input
            v-model="talentKeyword"
            class="search-input"
            placeholder="搜索人才关键词…"
            clearable
            @keyup.enter="runTalents"
          />
          <Button theme="primary" @click="runTalents">查询</Button>
        </div>

        <Loading v-if="talentsLoading" class="state" text="加载中…" />
        <EmptyBlock v-else-if="talentsError" :text="talentsError" />
        <EmptyBlock v-else-if="(talents ?? []).length === 0" text="暂无匹配人才" />
        <div v-else class="list stagger">
          <article v-for="t in talents" :key="t.uid" class="talent-card m-card">
            <div class="row-head">
              <h3 class="title name">{{ t.name }}</h3>
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
        <div class="search-row">
          <Input
            v-model="enterpriseKeyword"
            class="search-input"
            placeholder="搜索企业关键词…"
            clearable
            @keyup.enter="runEnterprises"
          />
          <Button theme="primary" @click="runEnterprises">查询</Button>
        </div>

        <Loading v-if="enterprisesLoading" class="state" text="加载中…" />
        <EmptyBlock v-else-if="enterprisesError" :text="enterprisesError" />
        <EmptyBlock v-else-if="(enterprises ?? []).length === 0" text="暂无企业数据" />
        <div v-else class="list stagger">
          <article
            v-for="e in enterprises"
            :key="e.id"
            class="enterprise-card m-card"
            @click="router.push(`/enterprises/${e.id}`)"
          >
            <div class="row-head">
              <h3 class="title name">{{ e.name }}</h3>
              <span v-if="e.showcaseStatus === 'published'" class="showcase-tag">入驻展示</span>
            </div>
            <p class="meta">{{ e.industry }} · {{ e.size }}</p>
            <p class="intro">{{ e.description }}</p>
            <p class="members">成员（{{ e.members.length }}）：{{ e.members.join('、') }}</p>
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
        <p class="p-updated">更新时间：{{ currentPolicy.updatedAt }}</p>
        <Button variant="outline" block @click="policyVisible = false">关闭</Button>
      </div>
    </Popup>
  </div>
</template>

<style scoped>
.m-community {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.top-tabs {
  --td-tabs-track-color: var(--td-brand-color);
}

.state {
  padding: 20px 0;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.search-input {
  flex: 1;
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

.cat-tag,
.role-tag,
.showcase-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--td-brand-color-1);
  color: var(--td-brand-color);
}

.showcase-tag {
  background: var(--td-success-color-light);
  color: var(--td-success-color);
}

.updated,
.meta,
.members {
  font-size: 11px;
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
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
</style>