# Joinyuu Community Agent Guide

## Repository Overview

- This repository is a pnpm workspace. Workspace packages are under `apps/*` and `packages/*`.
- The active applications are `apps/admin` (Vue 3 + TypeScript + Vite + TDesign admin web) and `apps/api` (NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4 backend).
- The current stage is **M1.5 completed** (admin governance enhancement, R1~R12: RBAC/account/security/upload/rich-text/monitoring/charts/export), plus follow-up hardening and UX/governance work (security hardening, archive system, terminology unification, ID display rules, list interaction cleanup, role creation, bulk session kick-off). M0 (admin prototype) and M1 (backend, M1-A~E: 129 endpoints, admin fully HTTP-integrated, `src/mock/` removed) are complete; the API currently exposes 189 `/api/admin/**` routes over 43 Prisma models (14 migrations). Client web (M2) and mini program (M3) are not started.
- Read `README.md`, `docs/wiki-backend.md`, `docs/wiki-admin-web.md`, and `docs/full-spec-check.md` before making broad changes. The wikis are the frozen contracts; `full-spec-check.md` is the progress reference (includes the M1.5 R1~R12 front/back-end routes).

## Commands

Run these from the repository root unless noted otherwise:

```bash
pnpm install
pnpm dev:admin
pnpm build:admin
pnpm db:up          # PostgreSQL 17 + Redis 7.4 via Docker Compose (waits for health)
pnpm dev:api        # NestJS dev server on port 7757
pnpm build:api
pnpm db:reset       # drop + migrate + full seed (idempotent)
```

- The admin dev server uses port `7758` (binds `0.0.0.0`) and proxies `/api` to the backend at `http://127.0.0.1:7757`; the API dev server uses port `7757`.
- `pnpm build:admin` runs the Vite production build. It does not type-check Vue SFC templates.
- TypeScript-only checks: `pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit` (admin) and `pnpm --filter @joinyuu/api exec tsc -p tsconfig.json --noEmit` (api). From `apps/admin`/`apps/api` you can also run `pnpm exec tsc -p tsconfig.json --noEmit`; plain `pnpm exec tsc` at the repo root fails because TypeScript is a dependency of the apps, not the workspace root. Neither check validates Vue templates fully (unregistered components or wrong template variables can still slip through).
- Backend e2e suite: `pnpm --filter @joinyuu/api test:e2e` (25 suites / 169 cases; requires Docker services up; each suite reseeds via `test/helpers/reseed.ts`). There is no ESLint configuration and no unit test suite yet. Do not claim more was verified than actually ran.

## Application Structure

- `apps/admin/src/main.ts` registers Vue, Pinia, the router, TDesign Vue Next, global styles, the `v-permission` directive, and the persisted theme store.
- `apps/admin/src/layouts/AdminLayout.vue` is the single admin shell. Keep menu order, active-route normalization, tab behavior, notifications, breadcrumbs, and group expansion behavior consistent there.
- `apps/admin/src/router/index.ts` is the route table with the RBAC route guard. Use named existing routes/paths and preserve the hash-router setup when adding navigation.
- `apps/admin/src/views/` contains page-level views; `apps/admin/src/components/` contains reusable UI; `apps/admin/src/stores/` contains Pinia state.
- `apps/admin/src/types/index.ts` contains the M0 domain types; the frozen database model lives in `apps/api/prisma/schema.prisma` (43 models / 14 migrations).
- `apps/api` is the backend: `prisma/seed.ts` + `prisma/seed-data/` (single seed source, idempotent), `src/modules/<domain>/` per-domain Nest modules (including `assets` and `system/{admins,login-logs,monitor,roles,trash,export}`), `src/common/` infrastructure (envelope interceptor, exception filter, JWT + permission guards, RBAC service, `@RequirePermission`/`@Public` decorators, audit service, id generator, points engine, storage service, sanitize-html/device/time utils), `src/scheduler/` cron jobs (scheduled publish, event auto-end, lease expiry, archive auto-archive/auto-purge).
- `apps/admin` governance additions: `src/views/system/` (ArchivePanel 归档管理, RolePanel, AdminPanel, LoginLogsPanel, MonitorPanel, SessionPanel, AssetLibrary, ChangePasswordView, ForbiddenView), `src/components/` (RichEditor, TrendChart, ColumnController, BulkArchiveDialog, EnterpriseFormDialog, ExternalEnterpriseFormDialog, ArticleReviewDialog, ArticleScheduleDialog, ...), `src/directives/permission.ts`, `src/constants/permissions.ts`, `src/stores/theme.ts`, plus `src/views/contents/ArticlePublishPanel.vue` / `ArticleSubmissionPanel.vue`, `src/views/approvals/ApprovalPrintView.vue`, `src/views/workstations/LeaseDetailView.vue` / `LeasePrintView.vue`.

## Data And API Pattern

- `apps/admin/src/api/` is the service layer. All 28 domain files go through the real HTTP client (`src/api/http.ts`) against `/api/admin/**`; the shared mock directory was removed during M1-E (seed data now lives in `apps/api/prisma/seed-data/`). UI code should call this layer, never import seed arrays directly.
- RBAC: admin routes are guarded by `@RequirePermission` (permission catalog with 49 codes, supporting `string | string[]` any-of) plus the global JWT guard; the frontend applies `v-permission` and route `meta.perm` checks (`src/directives/permission.ts`, `src/constants/permissions.ts`).
- Archive system: soft delete uses `deletedAt`/`deletedBy`; `TrashService` exposes 13 domains with restore/purge plus per-domain `ArchiveSetting` (auto-archive/auto-delete delays and archivable statuses), driven by scheduler jobs. User-history domains require triple confirmation before purge or enabling auto-purge.
- Assets are stored through `StorageService` (local disk, `UPLOAD_DIR`) and served from `/api/public/files/:key`; uploads are magic-byte sniffed (SVG rejected) and HTML is sanitized before write.
- Seed writes 24 IdSequence prefixes (U/E/AP/D/P/EV/XE/EX/PT/G/RO/R/WS/WA/LS/S/SR/A/SU/CL/SC/AN/N/AL) plus per-year `CODE-<year>` project codes; submitted articles use the SU prefix; custom roles use the R prefix (built-ins R1~R4 are seeded, generated roles continue from R5).
- Backend endpoints return the exact M0 stub shapes; the global envelope interceptor wraps them into `{ code: 0, data }`. Errors use 400/404/409 with the exact M0 Chinese messages. See `docs/wiki-backend.md` §4.
- Successful write operations on the backend record an audit entry through `AuditService` (`@Audit` decorator or direct call) when the M0 domain had `recordAudit`. The frontend no longer records audit entries for HTTP-ized domains.
- Backend state is PostgreSQL with seedable fixtures (`pnpm db:reset` reproduces it). Do not describe admin web state as persisted mock state.

## UI Conventions

- Use TDesign Vue Next components and `tdesign-icons-vue-next` icons. Before introducing or changing a TDesign component API, query the TDesign MCP with `framework: "vue-next"` when documentation is not already clear in the code.
- Do not introduce Element UI, Ant Design, Naive UI, Vant, or native form controls in the admin UI.
- Use TDesign token variables for shared colors, spacing, and radii. Keep page-specific styling scoped unless a token or global convention is intentionally being changed.
- Tables using resizable columns must keep `table-layout="fixed"`.
- TDesign form fields must be properties of the object passed through `:data` for built-in required rules and red-star validation to work. Avoid JSX-style syntax in Vue templates; use Vue bindings such as `:clearable="false"`.
- For identifiers and display values, follow the current types and seed data. In particular, users use `uid` and `nickname`; when showing a person's name, prefer `realName` and fall back to `nickname` where the existing view convention requires it.
- Terminology is unified: use 联系电话 / 办公位 / 社区企业 / 合作企业 / 经验值 / 审核 / 新增 / 归档; do not reintroduce 联系方式 / 工位 / 审批 / 新建 / 回收站.
- Entity IDs render as `.id-tag` (inline with a label) or `.id-tag-block` (own line under a name); option/tag names use the `名称 [ID]` format, and one view must not repeat the same ID.
- Archive UI (`src/views/system/ArchivePanel.vue`) has 13 domain tabs plus per-tab archive settings; purging user-history domains or enabling their auto-purge requires triple confirmation (two confirms plus typing 永久删除).
- List pages have no table bulk actions and no refresh buttons. Column visibility/order configuration (`ColumnController`) covers 20 list pages and persists to localStorage.
- The top-bar 全部关闭 behaves like 关闭其他: keep the dashboard and the current tab.

## Change And Verification Rules

- Keep changes minimal and preserve existing visual language and route behavior.
- Before editing a page, inspect its API, types, seed data, and related shared components. Update all consumers when changing a domain field or status.
- After admin edits, run `pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit` and `pnpm build:admin` when applicable. After api edits, run `pnpm --filter @joinyuu/api exec tsc -p tsconfig.json --noEmit` and `pnpm build:api`; run the e2e suite when behavior changed (requires `pnpm db:up`; each suite reseeds itself). Also grep for declarations/usages when doing scripted or cross-file changes, because TypeScript does not validate Vue templates completely.
- Use browser automation only when explicitly requested or when a runtime-only issue cannot be verified statically. If browser testing is used, do not commit `.playwright-cli/` artifacts.
- Do not commit build output, secrets, local environment files, `node_modules/`, `dist/`, `.workbuddy/`, or `.playwright-cli/`.
