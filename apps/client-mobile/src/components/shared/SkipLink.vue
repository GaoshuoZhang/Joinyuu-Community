<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
</template>

<style scoped>
.skip-link {
  position: fixed;
  left: 8px;
  top: -48px;
  z-index: 1000;
  padding: var(--app-space-5) var(--app-space-7);
  border-radius: var(--td-radius-default);
  background: var(--td-brand-color);
  color: var(--td-text-color-anti);
  font-size: var(--app-font-body);
  transition: top 160ms ease;
}

.skip-link:focus {
  top: calc(8px + env(safe-area-inset-top));
}

:global(#main:focus),
:global(#main:focus-visible) {
  outline: none;
}
</style>
