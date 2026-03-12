# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

LUSIA Studio is a B2B education platform (Teacher CRM) with two services:

- **Backend** (`LUSIA Studio - Backend/`): FastAPI (Python 3.12), runs on port 8000
- **Frontend** (`LUSIA Studio - Frontend/`): Next.js 14 (React 18, TypeScript, Tailwind CSS v4), runs on port 3000

All persistence is via remote **Supabase** (cloud PostgreSQL + Auth + Storage) — there is no local database.

### Running Services

- **Backend**: `cd "LUSIA Studio - Backend" && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`
- **Frontend**: `cd "LUSIA Studio - Frontend" && npm run dev`
- **Lint**: `cd "LUSIA Studio - Frontend" && npm run lint`
- **Build**: `cd "LUSIA Studio - Frontend" && npm run build`

### Non-obvious Caveats

- **Directory names contain spaces**: Always quote paths when using shell commands (e.g., `cd "LUSIA Studio - Backend"`).
- **`mistralai` v2.x breaks `instructor`**: The `instructor` package requires `mistralai<2.0.0`. If pip resolves `mistralai>=2.0.0`, the backend will crash on import. Pin with `pip install 'mistralai>=1.0.0,<2.0.0'` after installing requirements.
- **`pandoc` system dependency**: Required by `pypandoc` for document conversion. Must be installed via `apt-get install -y pandoc`.
- **`python3.12-venv`**: The base VM does not ship with `python3.12-venv`, so it must be installed before creating the virtualenv.
- **Backend `.env`**: Required env vars `SUPABASE_URL_B2B`, `SUPABASE_SERVICE_KEY_B2B`, and `APP_AUTH_SECRET` have no defaults — the server will not start without them. These are injected as Cursor Cloud secrets.
- **Frontend `.env`**: Needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_API_BASE_URL` (should point to the local backend). These are injected as Cursor Cloud secrets.
- **No automated tests**: The project has no test suite configured (`npm test` exits with error). Validation is manual via the running app.
- **Backend Swagger docs**: Available at the `/docs` path on the backend server.
- **UI language is Portuguese** (the app targets Portuguese-speaking educational organizations).
