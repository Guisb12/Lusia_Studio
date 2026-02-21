export type StudioUser = {
  id: string;
  email?: string | null;
  email_verified?: boolean;
  email_verified_at?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: "admin" | "teacher" | "student" | null;
  status?: "pending_approval" | "active" | "suspended" | null;
  phone?: string | null;
  grade_level?: string | null;
  course?: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  organization_logo_url?: string | null;
  organization_status?: "trial" | "active" | "suspended" | "canceled" | null;
  profile_exists?: boolean;
  onboarding_completed?: boolean;
  subject_ids?: string[] | null;
  subjects_ids?: string[] | null;
  profile?: {
    subject_ids?: string[] | null;
    subjects_ids?: string[] | null;
  } | null;
};

export type AuthMeResponse = {
  authenticated: boolean;
  user: StudioUser | null;
};

export function getSetupDestination(): string {
  return "/auth/recover";
}

export function getRoleDestination(role?: string | null): string {
  return role === "student" ? "/student" : "/dashboard";
}

export function getOnboardingDestination(role?: string | null): string {
  if (role === "student") return "/onboarding/student";
  if (role === "admin") return "/onboarding/admin";
  return "/onboarding/teacher";
}

export function getDestinationFromUserState(user: StudioUser): string {
  if (user.status === "suspended") return "/login?suspended=1";
  if (user.profile_exists === false) return getSetupDestination();
  if (user.email_verified === false) return "/verify-email";
  if (!user.organization_id) return getSetupDestination();
  if (user.status === "pending_approval") return getOnboardingDestination(user.role);
  if (!user.onboarding_completed) return getOnboardingDestination(user.role);
  return getRoleDestination(user.role);
}
