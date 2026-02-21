import { getApiErrorMessage } from "@/lib/api-error";

export type MemberCompleteInput = {
  enrollmentToken?: string | null;
  enrollmentCode?: string | null;
  fullName?: string | null;
};

export type MemberCompleteResult = {
  ok: boolean;
  status: number;
  payload: unknown;
};

type RequestBody = {
  enrollment_token?: string;
  enrollment_code?: string;
  full_name?: string;
};

function buildAttemptBodies(input: MemberCompleteInput): RequestBody[] {
  const token = input.enrollmentToken?.trim();
  const code = input.enrollmentCode?.trim();
  const fullName = input.fullName?.trim();
  const attempts: RequestBody[] = [];
  const optionalFullName = fullName ? { full_name: fullName } : {};

  if (token && code) {
    attempts.push({
      enrollment_token: token,
      enrollment_code: code,
      ...optionalFullName,
    });
  }
  if (token) {
    attempts.push({ enrollment_token: token, ...optionalFullName });
  }
  if (code) {
    attempts.push({ enrollment_code: code, ...optionalFullName });
  }

  return attempts;
}

export async function completeMemberEnrollment(
  input: MemberCompleteInput,
): Promise<MemberCompleteResult> {
  const attempts = buildAttemptBodies(input);
  if (attempts.length === 0) {
    return {
      ok: false,
      status: 422,
      payload: { error: "Missing enrollment token/code." },
    };
  }

  let lastFailure: MemberCompleteResult | null = null;

  for (const body of attempts) {
    const response = await fetch("/api/auth/member/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);

    if (response.ok) {
      return { ok: true, status: response.status, payload };
    }

    lastFailure = { ok: false, status: response.status, payload };

    // Retry only on validation mismatch; other statuses should surface immediately.
    if (response.status !== 422) {
      return lastFailure;
    }
  }

  return (
    lastFailure ?? {
      ok: false,
      status: 500,
      payload: { error: "Unknown member completion failure." },
    }
  );
}

export function getMemberCompleteErrorMessage(payload: unknown): string {
  return getApiErrorMessage(payload, "Erro ao completar inscrição.");
}
