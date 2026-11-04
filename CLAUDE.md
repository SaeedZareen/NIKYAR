@AGENTS.md

## Project guide (for development sessions)

NIKYAR is a modular Persian BPMS/ERP platform. Read `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` first.

### Layout
- `backend/core/*` — platform core (kernel, accounts, org, lookups, forms, workflow, audit, files, numbering, notifications). Core never imports from `modules/`.
- `backend/modules/*` — business modules. Each declares a `ModuleSpec` as `nikyar_module` on its AppConfig (permissions, lookups, process actions, extensible entities, sequences) and is listed in `NIKYAR_APPS`.
- `frontend/src/app` — shell, auth, API client, module registry. `frontend/src/core`, `frontend/src/modules` mirror the backend.
- UI components come from vibefarsi (`src/components/ui`, `src/components/charts`). Add more with `NODE_USE_ENV_PROXY=1 npx vibefarsi add <slug>` from `frontend/`; the vibefarsi MCP server is configured in `.mcp.json`.

### Rules
- All user-facing text is formal Persian. API errors raise `core.kernel.api.BusinessError(message, fields)`.
- Permissions: use `core.kernel.api.Perm` with a `perms` map on the view; frontend uses `useAuth().can()`.
- System lookups (`LookupSpec(system=True)`) are locked; business rules may depend on their codes. Editable lookups are user data.
- Forms: field types live in `backend/core/forms/fields.py` and `frontend/src/core/forms/FormRenderer.tsx`; keep both in sync.
- Writes go through `AuditedViewSetMixin` (or `core.audit.service.record`) so every change is audited.
- Dates: Jalali strings `YYYY/MM/DD` in the API, `JalaliDateField` in serializers.

### Commands
- Backend tests: `cd backend && python manage.py test tests`
- Demo data: `python manage.py seed_demo` (password `nikyar123`)
- Frontend type check: `cd frontend && npx tsc -b --noEmit`
