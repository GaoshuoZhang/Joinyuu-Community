<script setup lang="ts">
import { provide } from 'vue'

/* 页头嵌入标记的作用域容器。
 * provide 会覆盖所在组件的全部后代：若直接写在聚合页的 setup 中，
 * 该聚合页自身的 PageHeader 也会被 inject 判为嵌入态而不渲染（页头整块消失），
 * 因此把标记收进这个只包裹选项卡子树的容器组件 */
provide('page-header:embedded', true)
</script>

<template>
  <slot />
</template>
