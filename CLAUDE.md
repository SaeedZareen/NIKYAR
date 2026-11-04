@AGENTS.md

## Project guide (for development sessions)

NIKYAR is a modular Persian BPMS/ERP platform. Read `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` first.

### Layout
- `backend/core/*` — platform core (kernel, accounts, org, lookups, forms, workflow, audit, files, numbering, notifications). Core never imports from `modules/`.
- `backend/modules/*` — business modules. Each declares a `ModuleSpec` as `nikyar_module` on its AppConfig (permissions, lookups, process actions, extensible entities, sequences) and is listed in `NIKYAR_APPS`.
- `frontend/src/app` — shell, auth, API client, module registry. `frontend/src/core`, `frontend/src/modules` mirror the backend.
- UI components come from vibefarsi (`src/components/ui`, `src/components/charts`). Add more with `NODE_USE_ENV_PROXY=1 npx vibefarsi add <slug>` from `frontend/`; the vibefarsi MCP server is configured in `.mcp.json`.

### UI/UX (mandatory for any frontend change)
- Follow `design-system/nikyar/MASTER.md` (source of truth) and the installed skill `.claude/skills/ui-ux-pro-max` (rules: `references/quick-reference.md`). Use the shared primitives in `frontend/src/app/ui.tsx` and `frontend/src/app/list.tsx` instead of ad-hoc markup.
- Style is dense Rahkaran-like office software (navy topbar, tree menu, page tabs, compact toolbars, dense grids, side labels). Check every change at 1093×600 @1.25 (a 1366×768 laptop at 125%), then 1920 and 375.
- Lists are `ResponsiveList` with real links per row; list filters use `ListToolbar` + `ToolbarFilter` and live in the URL (`useUrlState`); read-only data is a definition list; failed submits show `ErrorSummary`; one primary action per screen.
- Builders (form/process) are full-height workspaces: see the `WORKSPACE` list in `app/Shell.tsx`.

### Rules
- All user-facing text is formal Persian. API errors raise `core.kernel.api.BusinessError(message, fields)`.
- Permissions: use `core.kernel.api.Perm` with a `perms` map on the view; frontend uses `useAuth().can()`.
- System lookups (`LookupSpec(system=True)`) are locked; business rules may depend on their codes. Editable lookups are user data.
- Forms: field types live in `backend/core/forms/fields.py` and `frontend/src/core/forms/FormRenderer.tsx`; keep both in sync.
- Writes go through `AuditedViewSetMixin` (or `core.audit.service.record`) so every change is audited.
- Dates: Jalali strings `YYYY/MM/DD` in the API, `JalaliDateField` in serializers.
- Settings: modules add sections via `ModuleSpec.settings` (form-schema sections); read with `core.orgsettings.service.get(key)`. Secret keys go in `ModuleSpec.secret_settings`.
- Notifications: call `core.notifications.models.notify(users, title, body, link)`; it fans out to SMS/email when enabled.
- Background jobs: `python manage.py nikyar_scheduler --loop` (reminders, escalation).

### Commands
- Backend tests: `cd backend && python manage.py test tests`
- Demo data: `python manage.py seed_demo` (password `nikyar123`)
- Frontend type check: `cd frontend && npx tsc -b --noEmit`
