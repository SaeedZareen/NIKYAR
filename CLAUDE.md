# NIKYAR — guide for development sessions

Modular Persian BPMS/ERP for on-premise installs in Iran (10–500 users). The product owner is not a developer: explain results in Persian, plainly (what was built, what to try on the laptop after `update.bat`, what comes next). Read `docs/ROADMAP.md` and `docs/ARCHITECTURE.md` first.

## Status and process
- Released: v0.4.0 (phases 0, 1, 2a, 2b, 3 — form builder). In progress: phase 4 (workflow on SpiffWorkflow + bpmn-js, owner choice; plan in `docs/ROADMAP.md`; owner condition: every process need configurable low-code, no org-written code). Start a package only after the owner approves it.
- Form builder rule: every field type lives in the engine catalogue (`backend/core/forms/fieldtypes.py`) with JSON Schema, Persian `x-messages` and shared vectors (`shared/vectors/`); the browser never writes its own validation messages.
- One work package (e.g. `3.1`) per session on branch `wp/<id>`; commit and push often so an interrupted session can resume from the branch. Merge to `main` (`--no-ff`) when the package meets the roadmap's definition of done.
- Keep docs current without being asked (owner rule): every package updates `ROADMAP.md` (status, implementation decisions, waiting list), `ARCHITECTURE.md`, `README.md` and `docs/CHANGELOG.md` as needed. When the owner approves a package ("تایید"، "start"), record the approval date in `ROADMAP.md` before starting the next one.
- Owner requests go to the roadmap's waiting list with a target package; answer "is it in this phase?" questions there.
- A phase ends with its release package (`X.R`): review, full tests, version bump (`VERSION` in `backend/config/settings.py`; the UI reads it from `/api/org/branding/`), changelog, tag. Tag pushes fail from the cloud environment: give the owner the `git tag`/`git push origin <tag>` commands.
- Commands for the owner run in Windows PowerShell 5 (no `&&`): one command per code block, in order.
- Rolling-wave planning: detail the next phase's packages in the roadmap and get approval before starting it.

## Stack
- Backend: Django 5.2 LTS + DRF + drf-spectacular, pytest, ruff. `backend/serve.py` (Waitress) serves API + built frontend on `0.0.0.0` and starts the background-job worker thread.
- Frontend: React 19, TypeScript, Vite, Tailwind 4, shadcn/ui (RTL, `radix-mira` style, lucide icons), TanStack Query + Table v9, react-hook-form + zod, React Router, date-fns-jalali, Avan Persian Date Picker (`@avan-persian/react`, wrapped in `components/jalali-calendar.tsx`).
- shadcn MCP server in `.mcp.json`. Add components only via `cd frontend && npx shadcn@latest add <name>` (needs `NODE_USE_ENV_PROXY=1` behind a proxy); check imports use `@/lib/utils` and translate English strings.
- TanStack Table v9 docs ship inside the package: `frontend/node_modules/@tanstack/*/skills/`.

## Backend conventions
- Apps live in `backend/core/<app>` (sellable modules later in `backend/modules/<module>` with `nikyar_module`). Capabilities are declared on the AppConfig: `nikyar_permissions`, `nikyar_lookups`, `nikyar_settings`, `nikyar_numbering`, `nikyar_notifications`, `nikyar_workflow_actions`, `nikyar_record_sources`, `nikyar_module`; background tasks with `@task` in the app's `tasks.py`. Core never depends on modules.
- Writable viewsets extend `core.audit.service.AuditedModelViewSet`; permissions via `HasPerm` + `perms = {action: code}` (`None` = any signed-in user; HasPerm also enforces the license); list filters via `MultiValueFilter.filter_fields`; text ordering via `PersianOrderingFilter`; business rule errors via `BusinessError(message, fields)`. Views that must work after license expiry set `license_exempt = True`.
- Notifications via `core.notifications.service.notify(...)` (after commit); SMS/email go through the job queue. File references use `FileRefField` (claim/release). Secrets use `SecretField`.
- Background tasks manage their own transactions; never run a backup inside a transaction (it raises).
- Serializer class names must be unique project-wide (they become OpenAPI component names). After any API change run `cd frontend && npm run api:types` and commit `src/lib/api/schema.d.ts`.
- New dependencies only with a real consumer; `requirements.txt` changes reach the owner via `update.bat`.

## Rules
- All user-facing text is formal Persian (labels, aria-labels, errors, toasts). Visible digits Persian; values/URLs/payloads Latin. Dates Jalali (`lib/format.ts`). No English browser UI (use `FilePicker`, not a bare `<input type=file>`).
- Text hierarchy (owner rule): helper text is never the same size as main text. Main text (labels, inputs, buttons, values) is `text-xs` (13px); secondary text (help, hints, meta, file sizes, timestamps) is `text-2xs` (12px) and muted. Explanatory help is collapsed into an ⓘ `InfoTip` by default: `description` on `FormField`, `Section` and `PageHeader` renders as ⓘ (screen readers still get it via `aria-describedby`). Only information that must always be visible — dynamic values, counters, calculation results, record status — is shown inline via `hint` (`FormField`) or `meta` (`Section`, `PageHeader`).
- Logical Tailwind classes only (`ms-/me-/ps-/pe-/start-/end-/text-start`). Colors only from tokens in `src/index.css` (including the themed scrollbar). Never smaller than `text-2xs`.
- Reuse the kits: `components/data-table`, `components/form` (`SectionForm`, `FormSheet`, `TokenInput`, inputs), `components/layout`, `components/files`. Do not hand-roll tables, fields or page headers. Group page content with `Section`; lay out fields with `FormGrid`; pages use the full width (no max-width containers).
- No dead code, unused dependencies, orphaned files or speculative placeholders: build a capability in the package that has its first real consumer. Remove what a change makes obsolete.
- Console/batch output is English (Windows consoles cannot render Persian); everything in the browser is Persian. Owner-facing tools get a double-click menu (see `license-tool.bat`).
- Windows scripts (`*.bat`) must keep CRLF line endings (`.gitattributes`). Supported Python is 3.12–3.14 (Django 5.2); `install.bat` picks one via the `py` launcher.
- Never commit private keys (`*.private.pem` is ignored); the owner's license public key is `backend/core/licensing/owner_public_key.pem`.

## Tests
- Backend tests use a file SQLite database (real concurrency); tests that back up or restore use `django_db(transaction=True)`.
- E2E runs its own Django on port 8100 with a fresh temp database, a worker (1 s interval) and fake SMS/email delivery (`frontend/e2e/start-backend.mjs`); never point tests at `backend/data`.
- The three Playwright projects run in parallel against one server: change global state (settings, license, numbering patterns) only in the `desktop` project; use unique data per test (fresh users, a separate year per project). The backup-restore test runs alone in the final `restore` project. Use `getByLabel(..., { exact: true })` (ⓘ buttons contain the label text).

## Verify before reporting done
- `cd frontend && npm run typecheck && npm run lint && npm test && npm run e2e` (Playwright: laptop 1093×600@1.25, desktop 1920, mobile; axe must show no serious/critical issues).
- `cd backend && ../.venv/bin/ruff check . && ../.venv/bin/ruff format --check . && ../.venv/bin/python -m pytest`
- `npm run build` then `python backend/serve.py` and open it once to confirm the production path works.
- Look at screenshots of new pages (laptop and mobile) before reporting; the owner cares about consistent, uniform layouts.
