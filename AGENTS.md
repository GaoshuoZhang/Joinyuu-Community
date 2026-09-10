# Joinyuu Community Agent Guide

## Repository Overview

- This repository is a pnpm workspace. Workspace packages are under `apps/*` and `packages/*`.
- The active application is `apps/admin`, a Vue 3 + TypeScript + Vite admin prototype for the Joinyuu Community.
- The current product stage is M0. The NestJS/PostgreSQL/Redis backend (M1), client web app (M2), and mini program (M3) are not implemented yet.
- Read `README.md`, `docs/wiki-admin-web.md`, and `docs/full-spec-check.md` before making broad UI or product changes. The wiki is the visual and interaction contract; `full-spec-check.md` is the progress reference.

## Commands

Run these from the repository root unless noted otherwise:

```bash
pnpm install
pnpm dev:admin
pnpm build:admin
```

- The admin dev server uses port `7758` and binds to `0.0.0.0`.
- `pnpm build:admin` runs the Vite production build. It does not type-check Vue SFC templates.
- For TypeScript-only checks, run `pnpm --filter @joinyuu/admin exec tsc -p tsconfig.json --noEmit` from the repository root (or `pnpm exec tsc -p tsconfig.json --noEmit` from `apps/admin`; plain `pnpm exec tsc` at the root fails because TypeScript is a dependency of `apps/admin`, not the workspace root). This still cannot catch every template error, such as an unregistered component or a wrong template variable.
- There is currently no repository test suite or ESLint configuration. Do not claim tests passed when only the Vite build was run.

## Application Structure

- `apps/admin/src/main.ts` registers Vue, Pinia, the router, TDesign Vue Next, and global styles.
- `apps/admin/src/layouts/AdminLayout.vue` is the single admin shell. Keep menu order, active-route normalization, tab behavior, notifications, breadcrumbs, and group expansion behavior consistent there.
- `apps/admin/src/router/index.ts` is the route table. Use named existing routes/paths and preserve the hash-router setup when adding navigation.
- `apps/admin/src/views/` contains page-level views; `apps/admin/src/components/` contains reusable UI; `apps/admin/src/stores/` contains Pinia state.
- `apps/admin/src/types/index.ts` contains the M0 domain types and is the basis for the planned M1 database model.

## Data And API Pattern

- `apps/admin/src/mock/` is the shared in-memory data source. Do not create page-local copies when behavior must remain consistent across views.
- `apps/admin/src/api/` is the service layer. Current functions simulate latency and mutate/read the shared mock data; UI code should call this layer instead of importing mock arrays directly.
- API files include TODO comments with the intended M1 REST endpoints. Preserve those comments when implementing the mock behavior and replace them with real requests during the backend migration.
- Successful write operations should record an audit entry through `recordAudit` when the domain already supports audit logging.
- Mock state is process-local and resets on reload. This is expected for M0 and must not be described as persistence.

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
- After edits, run `pnpm exec tsc -p apps/admin/tsconfig.json --noEmit` and `pnpm build:admin` when applicable. Also grep for declarations/usages when doing scripted or cross-file changes, because TypeScript does not validate Vue templates completely.
- Use browser automation only when explicitly requested or when a runtime-only issue cannot be verified statically. If browser testing is used, do not commit `.playwright-cli/` artifacts.
- Do not commit build output, secrets, local environment files, `node_modules/`, `dist/`, `.workbuddy/`, or `.playwright-cli/`.
