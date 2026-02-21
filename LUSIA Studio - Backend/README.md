# Teacher CRM Backend

FastAPI backend for B2B teacher CRM platform.

## Setup

1. Create virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\\Scripts\\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env` and fill in your Supabase credentials

4. Run development server:
   ```bash
   uvicorn app.main:app --reload
   ```

5. Visit http://localhost:8000/docs for API documentation

## Local Run Notes

- If port 8000 is busy, run with a different port:
  ```bash
  uvicorn app.main:app --reload --port 8001
  ```
- For auth/org flows, B2B vars are required. B2C vars are optional unless using content endpoints.
- `ENROLLMENT_TOKEN_TTL_SECONDS` controls member-enrollment token lifetime (default 7 days).
- If `zsh: command not found: python`, use `python3`.

## Auth setup

- Use `SUPABASE_AUTH_SETUP.md` for the required SQL schema and provider config.
- Apply `migrations/003_auth_hardening.sql` if your project was initialized before onboarding/auth hardening.
- The app now supports:
  - Organization creation (admin bootstrap)
  - Teacher/student enrollment by reusable organization code
  - Signup-first member flow: authenticate first, then attach code via `POST /api/v1/auth/enrollment/attach`
  - Role-aware onboarding and routing

## Project Structure

- `app/core/` - Core configuration, database, security
- `app/api/` - API routes (organized by feature)
- `app/models/` - Database models
- `app/schemas/` - Pydantic schemas for request/response
- `app/utils/` - Utility functions
