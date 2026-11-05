# NIKYAR — guide for development sessions

Modular Persian BPMS/ERP for on-premise installs in Iran. The product owner is not a developer: explain results in Persian, plainly. Read `docs/ROADMAP.md` and `docs/ARCHITECTURE.md` first. Work one work package (`docs/ROADMAP.md`, e.g. `2b.1`) per session on branch `wp/<id>`; commit and push often so an interrupted session can resume from the branch. Merge to `main` when the package meets the roadmap's definition of done and update its status there. A phase ends with its release package (`X.R`) and the owner's approval.

## Stack
- Backend: Django 5.2 LTS + DRF + drf-spectacular, pytest. `backend/serve.py` (Waitress) serves API + built frontend on `0.0.0.0` for LAN use.
- Frontend: React 19, TypeScript, Vite, Tailwind 4, shadcn/ui (RTL, `radix-mira` style, lucide icons), TanStack Query + Table v9, react-hook-form + zod, React Router, date-fns-jalali, Avan Persian Date Picker (`@avan-persian/react`, wrapped in `components/jalali-calendar.tsx`; its `--avan-*` variables are mapped to our tokens in `index.css`).
- shadcn MCP server is configured in `.mcp.json`. Add components only via `cd frontend && npx shadcn@latest add <name>` (needs `NODE_USE_ENV_PROXY=1` behind a proxy). After adding, check imports use `@/lib/utils` and translate any English user-facing strings.
- TanStack Table v9 docs ship inside the package: `frontend/node_modules/@tanstack/*/skills/`.

## Backend conventions
- Apps live in `backend/core/<app>` (modules later in `backend/modules/<module>`); each declares `nikyar_permissions` and `nikyar_lookups` on its AppConfig.
- Writable viewsets extend `core.audit.service.AuditedModelViewSet`; permissions via `HasPerm` + `perms = {action: code}`; list filters via `MultiValueFilter.filter_fields`; text ordering via `PersianOrderingFilter`; business rule errors via `BusinessError(message, fields)`.
- After any API change run `cd frontend && npm run api:types` and commit `src/lib/api/schema.d.ts`.
- E2E runs its own Django on port 8100 with a fresh temp database (`frontend/e2e/start-backend.mjs`); never point tests at `backend/data`.

## Rules
- All user-facing text is formal Persian (labels, aria-labels, errors, toasts). Visible digits Persian; values/URLs/payloads Latin. Dates Jalali (`lib/format.ts`).
- Logical Tailwind classes only (`ms-/me-/ps-/pe-/start-/end-/text-start`). Colors only from tokens in `src/index.css`.
- Reuse the kits: `components/data-table`, `components/form`, `components/layout`. Do not hand-roll tables, fields or page headers. Group page content with `Section`; lay out fields with `FormGrid`; pages use the full width (no max-width containers).
- No dead code, unused dependencies, orphaned files or speculative placeholders. Remove what a change makes obsolete.
- Console/batch output is English (Windows consoles cannot render Persian); everything in the browser is Persian.
- Windows scripts (`*.bat`) must keep CRLF line endings (`.gitattributes`). Supported Python is 3.12–3.14 (Django 5.2); `install.bat` picks one via the `py` launcher.

## Verify before reporting done
- `cd frontend && npm run typecheck && npm run lint && npm test && npm run e2e` (Playwright: laptop 1093×600@1.25, desktop 1920, mobile; axe must show no serious/critical issues).
- `cd backend && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check . && ../.venv/bin/python -m pytest`
- `npm run build` then `python backend/serve.py` and open it once to confirm the production path works.
