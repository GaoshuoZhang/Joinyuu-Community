<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
</template>

<style scoped>
.skip-link {
  position: fixed;
  left: var(--app-space-3);
  top: calc(-1 * (var(--app-space-12) + var(--app-space-8)));
  z-index: 1000;
  padding: var(--app-space-5) var(--app-space-7);
  border-radius: var(--td-radius-default);
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  font: var(--app-type-body);
  /* v51：改用 transform 位移（合成层）而非 top（布局属性，逐帧重排）；
     位移量 = 隐藏位 top 的绝对值 + 聚焦位 top，即 32 + 16 + 4 + 安全区 */
  transition: transform 160ms ease;
}

.skip-link:focus {
  transform: translateY(calc(var(--app-space-12) + var(--app-space-8) + var(--app-space-3) + env(safe-area-inset-top)));
}

:global(#main:focus),
:global(#main:focus-visible) {
  outline: none;
}
</style>
