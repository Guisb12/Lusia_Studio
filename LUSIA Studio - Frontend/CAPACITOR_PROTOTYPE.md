# Capacitor Prototype

This frontend now includes a same-repo Capacitor prototype for the student app.

## Environment

Add these variables to your local env when testing the native shells:

```bash
BACKEND_API_URL=http://localhost:8000
CAPACITOR_SERVER_URL=https://your-hosted-frontend.example.com
# Optional overrides
CAPACITOR_APP_ID=com.lusiastudio.student
CAPACITOR_APP_NAME="LUSIA Student"
NEXT_PUBLIC_CAPACITOR_AUTH_SCHEME=com.lusiastudio.student
CAPACITOR_ALLOW_NAVIGATION=your-hosted-frontend.example.com,api.example.com
```

For local development, `CAPACITOR_SERVER_URL` defaults to `http://localhost:3000`.

When using the Android emulator locally:

```bash
BACKEND_API_URL=http://localhost:8000
NEXT_PUBLIC_API_BASE_URL=http://10.0.2.2:8000
CAPACITOR_SERVER_URL=http://10.0.2.2:3000
```

`BACKEND_API_URL` is for the Next server running on your machine. `10.0.2.2` is only for the emulator to reach your machine.

## Workflow

```bash
npm run dev
npm run cap:sync
npm run cap:open:ios
npm run cap:open:android
```

The native projects load the hosted or local Next app URL configured in `capacitor.config.ts`.

## Native Google Login

Google OAuth in the Capacitor shell uses a native browser round-trip and a deep link back into the app.

Supabase redirect URLs must include:

```text
com.lusiastudio.student://auth/callback
http://localhost:3000/auth/callback
http://10.0.2.2:3000/auth/callback
```

## Validation Matrix

| Screen | Status | Notes |
| --- | --- | --- |
| Login | Pending | Validate cookie persistence and redirect flows in WebView. |
| Home | Pending | Confirm safe areas and sidebar menu affordance. |
| Sessions | Pending | Confirm scroll behavior and long lists. |
| Profile | Pending | Confirm avatar upload and form focus behavior. |
| Assignments | Pending | Confirm panels, previews, and file interactions. |
| Grades | Pending | Confirm dense layouts and overlays. |
| Chat | Pending | Confirm keyboard behavior, image uploads, and sticky composer. |

## Phase 2 Decision

- Continue with Capacitor hardening if all student routes load and only minor WebView/mobile fixes remain.
- Reconsider Expo/React Native if auth persistence, complex overlays, or key student flows remain unstable after prototype validation.
