import { BACKEND_API_URL } from "@/lib/config";

export async function POST(request: Request) {
  if (!BACKEND_API_URL) {
    return Response.json(
      { error: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 500 },
    );
  }

  const incomingBody = await request.json().catch(() => ({} as Record<string, unknown>));
  const incomingCode =
    typeof incomingBody.code === "string"
      ? incomingBody.code
      : typeof incomingBody.enrollment_code === "string"
        ? incomingBody.enrollment_code
        : null;
  const normalizedCode = incomingCode?.trim();

  const buildBody = (code?: string) => ({
    ...incomingBody,
    ...(code
      ? {
          code,
          enrollment_code: code,
          enrollmentCode: code,
        }
      : {}),
  });

  const runValidate = async (body: Record<string, unknown>) => {
    const response = await fetch(`${BACKEND_API_URL}/api/v1/auth/enrollment/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ valid: false }));
    return { response, payload };
  };

  const firstAttempt = await runValidate(buildBody(normalizedCode));
  const isFirstValid =
    firstAttempt.response.ok &&
    !!firstAttempt.payload?.valid &&
    !!firstAttempt.payload?.enrollment_token;

  if (isFirstValid || !normalizedCode) {
    return Response.json(firstAttempt.payload, { status: firstAttempt.response.status });
  }

  const upperCode = normalizedCode.toUpperCase();
  if (upperCode === normalizedCode) {
    return Response.json(firstAttempt.payload, { status: firstAttempt.response.status });
  }

  const retryAttempt = await runValidate(buildBody(upperCode));
  return Response.json(retryAttempt.payload, { status: retryAttempt.response.status });
}
