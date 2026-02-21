# Session Persistence: How Users Stay Logged In

## Overview

The app implements **persistent login sessions** using Supabase Auth's automatic token refresh mechanism. Users remain logged in indefinitely until they manually log out or clear their browser cookies.

## How It Works

### 1. **Automatic Token Refresh on Every Request**

Every request to your app goes through Next.js middleware (`middleware.ts`), which calls `updateSession()`:

```typescript
// lib/supabase/middleware.ts
await supabase.auth.getUser();
```

This single call does the following:
- **Checks if the access token is expired**
- **If expired**: Automatically uses the refresh token (stored in cookies) to get a new access token
- **If valid**: Returns the current user without any refresh needed
- **Updates cookies** with new token values if refreshed

### 2. **Supabase Cookie Storage**

Supabase SSR (`@supabase/ssr`) stores authentication tokens in **HTTP-only cookies**:

- **Access Token**: Short-lived (typically 1 hour), used for API calls
- **Refresh Token**: Long-lived (default: **30 days**, configurable up to **1 year**), used to get new access tokens

These cookies are:
- **HTTP-only**: Cannot be accessed by JavaScript (XSS protection)
- **Secure**: Sent only over HTTPS in production
- **Persistent**: Survive browser restarts and tab closures
- **Domain-scoped**: Only sent to your app's domain

### 3. **Refresh Token Lifetime**

By default, Supabase refresh tokens last **30 days**. This means:
- User logs in once
- As long as they visit your app within 30 days, the refresh token is renewed
- The 30-day window resets on each successful refresh
- Users effectively stay logged in **indefinitely** if they use the app regularly

**To extend this further**, you can configure Supabase:
- Go to **Supabase Dashboard → Authentication → Settings**
- Set **"JWT expiry"** and **"Refresh token rotation"** settings
- Maximum refresh token lifetime can be set up to **1 year**

### 4. **What Happens on Each Request**

```
User visits any page
    ↓
Middleware runs (middleware.ts)
    ↓
updateSession() called
    ↓
supabase.auth.getUser()
    ↓
[Token Check]
    ├─ Access token valid? → Use it, continue
    └─ Access token expired? → Use refresh token → Get new access token → Update cookies → Continue
    ↓
User stays authenticated ✅
```

## When Users Get Logged Out

Users will only be logged out in these scenarios:

### 1. **Manual Logout** (Explicit Action)
- User clicks a "Logout" button that calls `supabase.auth.signOut()`
- This clears all auth cookies

### 2. **Refresh Token Expires** (Very Rare)
- User doesn't visit the app for **30+ days** (or your configured lifetime)
- Refresh token expires and cannot be renewed
- Next visit requires re-login

### 3. **Browser Data Cleared**
- User clears cookies/cache for your domain
- User uses incognito/private browsing and closes the window
- User uninstalls/reinstalls browser

### 4. **Supabase Account Deleted**
- Admin deletes the user account in Supabase Dashboard
- User's refresh token is invalidated server-side

## Implementation Details

### Middleware Flow

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  // 1. Refresh session (auto-handles token refresh)
  const response = await updateSession(request);
  
  // 2. Check authentication status
  const identity = await getIdentityFromApi(request);
  
  // 3. Route based on auth state
  // ... routing logic ...
}
```

### Cookie Configuration

Supabase SSR automatically sets cookies with these properties:
- **Path**: `/` (available site-wide)
- **SameSite**: `lax` (CSRF protection)
- **HttpOnly**: `true` (XSS protection)
- **Secure**: `true` in production (HTTPS only)
- **Max-Age**: Matches refresh token lifetime

## Best Practices

### ✅ What's Already Implemented

1. **Automatic refresh**: Every request refreshes tokens if needed
2. **Cookie security**: HTTP-only, secure, SameSite protection
3. **Session validation**: Middleware checks auth on protected routes
4. **Graceful handling**: Expired tokens trigger re-authentication flow

### 🔧 Optional Enhancements

If you want even longer sessions:

1. **Extend refresh token lifetime** (Supabase Dashboard):
   - Go to **Authentication → Settings**
   - Increase **"JWT expiry"** and configure **"Refresh token rotation"**
   - Set max refresh token lifetime to **1 year** if desired

2. **Add "Remember Me" option** (if you want different lifetimes):
   - Short session: 7 days (for shared devices)
   - Long session: 1 year (for personal devices)
   - Requires custom cookie configuration

3. **Monitor session health** (optional):
   - Log token refresh events
   - Alert on unusual refresh patterns
   - Track session duration metrics

## Testing Session Persistence

To verify users stay logged in:

1. **Login** → Complete onboarding
2. **Close browser** → Wait 1 hour (access token expires)
3. **Reopen browser** → Visit your app
4. **Expected**: Still logged in (refresh token renewed access token)
5. **Wait 30+ days** → Visit app
6. **Expected**: Still logged in (refresh token renewed)

To test logout:
1. **Implement logout button** → Call `supabase.auth.signOut()`
2. **Expected**: Redirected to `/login`, cookies cleared

## Summary

**Users stay logged in because:**
- ✅ Every request automatically refreshes expired tokens
- ✅ Refresh tokens last 30 days (configurable up to 1 year)
- ✅ Cookies persist across browser sessions
- ✅ No manual re-authentication required

**Users only log out when:**
- ❌ They manually log out
- ❌ They don't visit for 30+ days (configurable)
- ❌ They clear browser cookies
- ❌ Their account is deleted

This is the standard "persistent session" pattern used by Gmail, Facebook, and other modern web apps.
