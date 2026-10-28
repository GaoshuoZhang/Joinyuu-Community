<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { scopeAllowsGroup } from '@/constants/scopes'
const props = defineProps<{ module: string }>()
const route = useRoute(), router = useRouter(), auth = useAuthStore()
const allowed = computed(() => auth.hasPerm('/commerce/receivables') && scopeAllowsGroup(auth.dataScope, auth.permissions, '交易经营'))
function open() { void router.push({ path: '/commerce/receivables', query: { module: props.module, ...(typeof route.params.id === 'string' ? { sourceId: route.params.id } : {}) } }) }
</script>
<template><div v-if="allowed" class="commerce-business-link"><t-button variant="outline" @click="open">查看收费账单</t-button></div></template>
<style scoped>.commerce-business-link { display: flex; justify-content: flex-end; margin-bottom: 12px; }</style>
