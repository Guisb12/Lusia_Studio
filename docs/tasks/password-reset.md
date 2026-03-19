---
status: completed
created: 2026-03-19
updated: 2026-03-19
priority: p1
planned-by: planner-agent
---

## Goal

Add password reset and password change capabilities to LUSIA Studio. Two flows: (1) a "forgot password" flow on the auth pages so unauthenticated users can recover access via email, and (2) a "change password" section on the user profile pages so authenticated users can update their password. Both flows use Supabase Auth APIs directly — no new backend endpoints or database tables are needed.

## User Intent

The user wants:
1. A way to reset a forgotten password from the login page (email-based recovery)
2. A way to change password from the profile page (all roles: admin, teacher, student)
3. Guidance on configuring the Supabase password reset email template

"Done" looks like: a user can click "Forgot password?" on the login page, receive an email, click the link, set a new password, and log in. A logged-in user can also change their password from their profile page.

## Context

### Current State
- **No password reset/change code exists** anywhere in the codebase
- Auth is handled by Supabase Auth (`@supabase/ssr`): `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server), `lib/supabase/middleware.ts`
- Auth callback page (`app/auth/callback/page.tsx`) already handles PKCE code exchange, token hash verification, and `recovery` OTP type — but no page sends users through the recovery flow
- Login page (`app/(auth)/login/page.tsx`) has no "forgot password" link
- Profile pages (`components/dashboard/TeacherProfilePage.tsx`, `components/student-profile/StudentProfilePage.tsx`) have no password change section
- Middleware (`middleware.ts`) protects routes and redirects based on user state. `AUTH_PAGES` set controls which pages redirect authenticated users away
- The existing `app/auth/recover/page.tsx` is for **enrollment code attachment**, NOT password recovery — do not touch it
- All UI text is in Portuguese (pt-PT)

### Key Files to Read
- `LUSIA Studio - Frontend/app/(auth)/login/page.tsx` — login page where "forgot password" link will be added
- `LUSIA Studio - Frontend/app/auth/callback/page.tsx` — reference for how PKCE code exchange works
- `LUSIA Studio - Frontend/middleware.ts` — needs update to handle new auth page
- `LUSIA Studio - Frontend/components/dashboard/TeacherProfilePage.tsx` — where password change section goes (teacher/admin)
- `LUSIA Studio - Frontend/components/student-profile/StudentProfilePage.tsx` — where password change section goes (student)
- `LUSIA Studio - Frontend/components/profile/ProfilePrimitives.tsx` — reusable profile UI components
- `LUSIA Studio - Frontend/lib/supabase/client.ts` — Supabase browser client used for auth API calls
- `docs/features/profile.md` — profile feature architecture

### Supabase Auth APIs Used
- **`supabase.auth.resetPasswordForEmail(email, { redirectTo })`** — sends recovery email, user gets a link to `redirectTo` with a PKCE `code` param
- **`supabase.auth.exchangeCodeForSession(code)`** — exchanges the PKCE code from the email link for an authenticated session
- **`supabase.auth.updateUser({ password })`** — updates the authenticated user's password (works for both recovery flow and logged-in change)

### Architecture Decision: No Backend Needed
Password reset/change is handled entirely by Supabase Auth on the client side. The backend (`FastAPI`) never sees or stores passwords — Supabase Auth manages the `auth.users` table directly. This means:
- No new backend schemas, services, or router endpoints
- No new database tables or migrations
- No new Next.js API proxy routes
- This is purely a frontend feature using Supabase client APIs

## Plan

### Subtask 1: Create the Forgot Password page
- **What:** Create a public page where unauthenticated users enter their email to receive a password reset link
- **Files:** `LUSIA Studio - Frontend/app/(auth)/forgot-password/page.tsx`
- **Pattern:** Follow the login page (`app/(auth)/login/page.tsx`) for visual style, layout, and Portuguese copy
- **Behavior:**
  - "use client" component wrapped in `<Suspense>`
  - Shows the LUSIA logo, a heading ("Recuperar password"), and an email input
  - On submit: calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/auth/reset-password' })`
  - On success: shows a confirmation message ("Enviamos um email com um link para redefinir a tua password. Verifica a tua caixa de entrada.")
  - On error: shows error via `toast.error()`
  - Includes a "Voltar ao login" link back to `/login`
- **Acceptance:** Page renders at `/forgot-password`. Submitting an email calls `resetPasswordForEmail`. Success/error states display correctly.

### Subtask 2: Create the Reset Password page (email link landing)
- **What:** Create the page users land on after clicking the email link. Exchanges the PKCE code, shows a "set new password" form.
- **Files:** `LUSIA Studio - Frontend/app/auth/reset-password/page.tsx`
- **Pattern:** Follow `app/auth/callback/page.tsx` for code exchange logic. Follow login page for visual style.
- **Behavior:**
  - "use client" component wrapped in `<Suspense>`
  - On mount: reads `code` from URL params → calls `supabase.auth.exchangeCodeForSession(code)`
  - If code exchange fails: show error message with link back to `/forgot-password`
  - If code exchange succeeds: show form with "Nova password" + "Confirmar password" fields
  - On submit: validates passwords match and minimum length (6 chars), calls `supabase.auth.updateUser({ password })`
  - On success: `toast.success("Password atualizada com sucesso.")`, redirect to `/` (middleware will route to the correct dashboard)
  - On error: show error message
  - Show the LUSIA logo and heading ("Definir nova password")
- **Acceptance:** Clicking email link lands on this page. Code is exchanged. User can set a new password. After success, user is redirected to their dashboard.

### Subtask 3: Update middleware to handle new auth pages
- **What:** Add `/forgot-password` to the `AUTH_PAGES` set so authenticated users are redirected away from it
- **Files:** `LUSIA Studio - Frontend/middleware.ts`
- **Changes:**
  - Add `"/forgot-password"` to the `AUTH_PAGES` set (line 18-26)
  - `/auth/reset-password` does NOT need to be added — it handles its own flow (like `/auth/callback`), and the user may arrive with no session yet (pre-code-exchange)
- **Acceptance:** An authenticated user navigating to `/forgot-password` is redirected to their dashboard. `/auth/reset-password` passes through middleware without interference.

### Subtask 4: Add "Forgot password?" link to login page
- **What:** Add a link below the login form password field that takes users to `/forgot-password`
- **Files:** `LUSIA Studio - Frontend/app/(auth)/login/page.tsx`
- **Changes:**
  - Add a link between the password `<Input>` and the submit `<Button>` (or below the form): `<Link href="/forgot-password" className="...">Esqueceste a password?</Link>`
  - Use subtle styling: `text-xs text-brand-primary/50 hover:text-brand-primary transition-colors` aligned right
  - Only show in login mode (not signup mode)
- **Acceptance:** "Esqueceste a password?" link visible on login form, navigates to `/forgot-password`.

### Subtask 5: Create ChangePasswordSection shared component
- **What:** Create a reusable component for changing password from the profile page
- **Files:** `LUSIA Studio - Frontend/components/profile/ChangePasswordSection.tsx`
- **Pattern:** Follow `ProfilePrimitives.tsx` patterns (`ProfileSection`, `ProfileSectionLabel`, `ProfileCard`)
- **Behavior:**
  - "use client" component
  - Uses `ProfileSection` wrapper with label "Seguranca" (or "Password")
  - Contains two password inputs: "Nova password" and "Confirmar nova password"
  - Submit button: "Alterar password"
  - On submit: validates match + min length (6 chars), calls `supabase.auth.updateUser({ password })`
  - On success: `toast.success("Password alterada com sucesso.")`, clears form
  - On error: `toast.error(...)` with error message
  - Loading state on the button during API call
  - Self-contained — no props needed (uses Supabase client directly)
- **Acceptance:** Component renders a password change form. Successful submission updates the password. Error and loading states handled.

### Subtask 6: Add ChangePasswordSection to TeacherProfilePage
- **What:** Add the password change section to the teacher/admin profile page
- **Files:** `LUSIA Studio - Frontend/components/dashboard/TeacherProfilePage.tsx`
- **Changes:**
  - Import `ChangePasswordSection`
  - Add it as the last section in the right column (after Contacto and Disciplinas sections, before the org settings section for admins)
- **Acceptance:** Password change section visible on teacher/admin profile page.

### Subtask 7: Add ChangePasswordSection to StudentProfilePage
- **What:** Add the password change section to the student profile page
- **Files:** `LUSIA Studio - Frontend/components/student-profile/StudentProfilePage.tsx`
- **Changes:**
  - Import `ChangePasswordSection`
  - Add it as the last section in the right column (after Encarregado de Educacao section)
- **Acceptance:** Password change section visible on student profile page.

### Subtask 8: Update profile feature doc
- **What:** Document the new password change capability in the profile feature doc
- **Files:** `docs/features/profile.md`
- **Changes:**
  - Add "Password change" to the sections listed in §3.4 and §3.5
  - Mention `ChangePasswordSection.tsx` in §3.6 Shared UI Components
  - Note that password change uses Supabase Auth directly (no backend involvement)
- **Acceptance:** Feature doc reflects the new password change section.

## Supabase Email Template Configuration

This is NOT a code task — it requires manual configuration in the Supabase Dashboard.

**Location:** Supabase Dashboard > Authentication > Email Templates > "Reset Password"

**Recommended template (Portuguese):**

```html
<h2 style="font-family: 'Inter', sans-serif; color: #1a1a2e;">Redefinir password</h2>
<p style="font-family: 'Inter', sans-serif; color: #444; font-size: 14px; line-height: 1.6;">
  Recebemos um pedido para redefinir a password da tua conta LUSIA Studio.
  Clica no botao abaixo para definir uma nova password:
</p>
<p style="margin: 24px 0;">
  <a href="{{ .ConfirmationURL }}"
     style="display: inline-block; padding: 12px 32px; background-color: #1a1a2e; color: #ffffff; text-decoration: none; border-radius: 8px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: 500;">
    Redefinir Password
  </a>
</p>
<p style="font-family: 'Inter', sans-serif; color: #888; font-size: 12px; line-height: 1.5;">
  Se nao fizeste este pedido, podes ignorar este email. A tua password nao sera alterada.
</p>
<p style="font-family: 'Inter', sans-serif; color: #888; font-size: 12px;">
  Este link expira em 24 horas.
</p>
```

**Key variable:** `{{ .ConfirmationURL }}` — Supabase replaces this with the full recovery URL. It automatically includes the PKCE code and redirects to the `redirectTo` URL specified in the `resetPasswordForEmail()` call.

**Required Supabase configuration:**
1. **Authentication > URL Configuration > Site URL:** Must be set to the production URL (e.g., `https://app.lusiastudio.com`)
2. **Authentication > URL Configuration > Redirect URLs:** Add `https://app.lusiastudio.com/auth/reset-password` (and `http://localhost:3000/auth/reset-password` for local dev)
3. **Authentication > Email Templates > Reset Password:** Paste the template above
4. **Subject line:** "Redefinir password — LUSIA Studio"

## Doc Updates Required
- [ ] Update `docs/features/profile.md` — add password change section documentation (Subtask 8)
- [ ] No new feature doc needed (this extends the existing profile + auth features)
- [ ] No `ARCHITECTURE.md` update needed (no new feature, no new routes in the inventory — this is an enhancement to existing auth + profile)
- [ ] No `README.md` update needed

## Verification
- [ ] `/forgot-password` page renders correctly and sends recovery email
- [ ] Email link redirects to `/auth/reset-password` with PKCE code
- [ ] `/auth/reset-password` exchanges code and shows password form
- [ ] Setting a new password via the recovery flow works end-to-end
- [ ] After recovery, user is redirected to their correct dashboard
- [ ] Authenticated users are redirected away from `/forgot-password`
- [ ] Password change section visible on teacher/admin profile page
- [ ] Password change section visible on student profile page
- [ ] Changing password from profile page works
- [ ] Validation: passwords must match, minimum 6 characters
- [ ] Error states: invalid email, expired link, network failure — all show clear Portuguese messages
- [ ] Code compiles: `cd "LUSIA Studio - Frontend" && npx tsc --noEmit`
- [ ] All UI text is in Portuguese (pt-PT)
