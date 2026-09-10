# Joinyuu Community Agent Guide

## Repository Overview

- This repository is a pnpm workspace. Workspace packages are under `apps/*` and `packages/*`.
- The active applications are `apps/admin` (Vue 3 + TypeScript + Vite + TDesign admin web) and `apps/api` (NestJS 11 + Prisma 6 + PostgreSQL 17 + Redis 7.4 backend).
- The current stage is M1 (backend). M0 (admin prototype) is complete; M1-A~D (115 admin endpoints + admin integration for 16/22 api files) are done; M1-E (system domain + mock removal) remains. Client web (M2) and mini program (M3) are not started.
- Read `README.md`, `docs/wiki-backend.md`, `docs/wiki-admin-web.md`, and `docs/full-spec-check.md` before making broad changes. The wikis are the frozen contracts; `full-spec-check.md` is the progress reference.

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
- Backend e2e suite: `pnpm --filter @joinyuu/api test:e2e` (15 suites / 72 cases; requires Docker services up; each suite reseeds via `test/helpers/reseed.ts`). There is no ESLint configuration and no unit test suite yet. Do not claim more was verified than actually ran.

## Application Structure

- `apps/admin/src/main.ts` registers Vue, Pinia, the router, TDesign Vue Next, and global styles.
- `apps/admin/src/layouts/AdminLayout.vue` is the single admin shell. Keep menu order, active-route normalization, tab behavior, notifications, breadcrumbs, and group expansion behavior consistent there.
- `apps/admin/src/router/index.ts` is the route table. Use named existing routes/paths and preserve the hash-router setup when adding navigation.
- `apps/admin/src/views/` contains page-level views; `apps/admin/src/components/` contains reusable UI; `apps/admin/src/stores/` contains Pinia state.
- `apps/admin/src/types/index.ts` contains the M0 domain types; the frozen M1 database model lives in `apps/api/prisma/schema.prisma` (35 models).
- `apps/api` is the backend: `prisma/seed.ts` (M0 mock → DB migration, idempotent), `src/modules/<domain>/` per-domain Nest modules, `src/common/` infrastructure (envelope interceptor, exception filter, JWT guard, audit service, id generator, points engine), `src/scheduler/` cron jobs.

## Data And API Pattern

- `apps/admin/src/mock/` is the shared in-memory data source. It still backs the 6 system-domain api files (M1-E switch) and is the source data for the backend seed. Do not create page-local copies when behavior must remain consistent across views.
- `apps/admin/src/api/` is the service layer. 16/22 domain files are already HTTP (via `src/api/http.ts`); the remaining 6 still read/write the shared mock. UI code should call this layer instead of importing mock arrays directly.
- Backend endpoints return the exact M0 stub shapes; the global envelope interceptor wraps them into `{ code: 0, data }`. Errors use 400/404/409 with the exact M0 Chinese messages. See `docs/wiki-backend.md` §4.
- Successful write operations on the backend record an audit entry through `AuditService` (`@Audit` decorator or direct call) when the M0 domain had `recordAudit`. The frontend no longer records audit entries for HTTP-ized domains.
- Mock state is process-local and resets on reload; backend state is PostgreSQL (seedable via `pnpm db:reset`). Do not describe mock state as persistence.

## UI Conventions

- Use TDesign Vue Next components and `tdesign-icons-vue-next` icons. Before introducing or changing a TDesign component API, query the TDesign MCP with `framework: "vue-next"` when documentation is not already clear in the code.
- Do not introduce Element UI, Ant Design, Naive UI, Vant, or native form controls in the admin UI.
- Use TDesign token variables for shared colors, spacing, and radii. Keep page-specific styling scoped unless a token or global convention is intentionally being changed.
- Tables using resizable columns must keep `table-layout="fixed"`.
- TDesign form fields must be properties of the object passed through `:data` for built-in required rules and red-star validation to work. Avoid JSX-style syntax in Vue templates; use Vue bindings such as `:clearable="false"`.
- For identifiers and display values, follow the current types and mock data. In particular, users use `uid` and `nickname`; when showing a person's name, prefer `realName` and fall back to `nickname` where the existing view convention requires it.

## Change And Verification Rules

- Keep changes minimal and preserve existing visual language and route behavior.
- Before editing a page, inspect its API, types, mock data, and related shared components. Update all consumers when changing a domain field or status.
- After admin edits, run `pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit` and `pnpm build:admin` when applicable. After api edits, run `pnpm --filter @joinyuu/api exec tsc -p tsconfig.json --noEmit` and `pnpm build:api`; run the e2e suite when behavior changed (requires `pnpm db:up`; each suite reseeds itself). Also grep for declarations/usages when doing scripted or cross-file changes, because TypeScript does not validate Vue templates completely.
- Use browser automation only when explicitly requested or when a runtime-only issue cannot be verified statically. If browser testing is used, do not commit `.playwright-cli/` artifacts.
- Do not commit build output, secrets, local environment files, `node_modules/`, `dist/`, `.workbuddy/`, or `.playwright-cli/`.
