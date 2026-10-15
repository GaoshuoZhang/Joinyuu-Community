<script setup lang="ts">
import { ref } from 'vue'
import ProjectFormDialog from '../../../src/components/ProjectFormDialog.vue'
import LeaseFormDialog from '../../../src/components/LeaseFormDialog.vue'
import BulkArchiveDialog from '../../../src/components/BulkArchiveDialog.vue'
import { captured, fixtureAuth, lease, optionStatus, project, releaseOptions } from './data'
const projectOpen = ref(false)
const leaseOpen = ref(false)
const bulkOpen = ref(false)
</script>
<template>
  <div>
  <t-card title="后台整改隔离验证">
    <t-alert theme="info" message="此页面使用内存测试数据，所有业务 API 已替换，保存不会连接业务环境。" />
    <t-space break-line style="margin-top: 16px">
      <t-button @click="projectOpen = true">编辑测试项目</t-button>
      <t-button @click="leaseOpen = true">编辑测试租约</t-button>
      <t-button @click="releaseOptions">完成选项加载</t-button>
      <t-button @click="bulkOpen = true">批量归档验证</t-button>
      <t-button href="#/system/config">查看系统配置</t-button>
      <t-button variant="outline" @click="fixtureAuth.permissions = ['/projects']">仅项目权限</t-button>
      <t-button variant="outline" @click="fixtureAuth.permissions = ['/system/messages']">仅通知配置权限</t-button>
      <t-button variant="outline" @click="fixtureAuth.permissions = ['*']">全部权限</t-button>
    </t-space>
    <p role="status">{{ optionStatus }}</p>
    <pre id="captured-payload" style="white-space: pre-wrap">{{ captured ? JSON.stringify(captured, null, 2) : '尚未提交测试数据' }}</pre>
    <t-table row-key="id" :horizontal-scroll-affixed-bottom="{ container: '.page-scroll' }" :data="[{ id: 'T1', name: '固定名称列', description: '隔离宽表验证', status: '正常' }]" :columns="[
      { colKey: 'name', title: '名称', width: 220, fixed: 'left' }, { colKey: 'description', title: '说明', width: 800 },
      { colKey: 'status', title: '状态', width: 120 }, { colKey: 'op', title: '操作', width: 170, fixed: 'right' },
    ]"><template #op><t-button variant="text">查看</t-button></template></t-table>
  </t-card>
  <ProjectFormDialog v-model:visible="projectOpen" mode="edit" :project="project" :demand="null" />
  <LeaseFormDialog v-model:visible="leaseOpen" mode="edit" :lease="lease" :workstations="[]" />
  <BulkArchiveDialog v-model:visible="bulkOpen" title="批量归档验证" :statuses="[{ label: '已结束', value: 'ended' }]" :count-for-status="async () => { await new Promise(resolve => setTimeout(resolve, 1500)); return 5 }" />
  </div>
</template>
