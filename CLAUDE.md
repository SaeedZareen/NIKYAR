# NIKYAR — guide for development sessions

Modular Persian BPMS/ERP for on-premise installs in Iran. The product owner is not a developer: explain results in Persian, plainly. Read `docs/ROADMAP.md` and `docs/ARCHITECTURE.md` first. Work phase by phase; a phase is done only when every test passes in the browser and the owner approves.

## Stack
- Backend: Django 5.2 LTS + DRF + drf-spectacular, pytest. `backend/serve.py` (Waitress) serves API + built frontend on `0.0.0.0` for LAN use.
- Frontend: React 19, TypeScript, Vite, Tailwind 4, shadcn/ui (RTL, `radix-mira` style, lucide icons), TanStack Query + Table v9, react-hook-form + zod, React Router, date-fns-jalali + @daypicker/persian.
- shadcn MCP server is configured in `.mcp.json`. Add components only via `cd frontend && npx shadcn@latest add <name>` (needs `NODE_USE_ENV_PROXY=1` behind a proxy). After adding, check imports use `@/lib/utils` and translate any English user-facing strings.
- TanStack Table v9 docs ship inside the package: `frontend/node_modules/@tanstack/*/skills/`.

## Rules
- All user-facing text is formal Persian (labels, aria-labels, errors, toasts). Visible digits Persian; values/URLs/payloads Latin. Dates Jalali (`lib/format.ts`).
- Logical Tailwind classes only (`ms-/me-/ps-/pe-/start-/end-/text-start`). Colors only from tokens in `src/index.css`.
- Reuse the kits: `components/data-table`, `components/form`, `components/layout`. Do not hand-roll tables, fields or page headers.
- No dead code, unused dependencies, orphaned files or speculative placeholders. Remove what a change makes obsolete.
- Console/batch output is English (Windows consoles cannot render Persian); everything in the browser is Persian.
- Windows scripts (`*.bat`) must keep CRLF line endings (`.gitattributes`). Supported Python is 3.12–3.14 (Django 5.2); `install.bat` picks one via the `py` launcher.

## Verify before reporting done
- `cd frontend && npm run typecheck && npm run lint && npm test && npm run e2e` (Playwright: laptop 1093×600@1.25, desktop 1920, mobile; axe must show no serious/critical issues).
- `cd backend && ../.venv/bin/python -m pytest`
- `npm run build` then `python backend/serve.py` and open it once to confirm the production path works.
