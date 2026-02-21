type FastApiValidationItem = {
  msg?: string;
  loc?: Array<string | number>;
};

type ApiErrorDetailObject = {
  code?: string;
  message?: string;
};

export function getApiErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const detail = record.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const code = (detail as ApiErrorDetailObject).code;
    if (typeof code === "string" && code.trim()) return code;
  }
  return null;
}

export function getApiErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (!payload || typeof payload !== "object") return fallback;

  const record = payload as Record<string, unknown>;
  const detail = record.detail;
  const error = record.error;

  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = (detail as ApiErrorDetailObject).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        const entry = item as FastApiValidationItem;
        if (entry?.msg) {
          if (entry.loc?.length) {
            const field = entry.loc.join(".");
            return `${field}: ${entry.msg}`;
          }
          return entry.msg;
        }
        return null;
      })
      .filter((value): value is string => !!value && value.trim().length > 0);

    if (messages.length > 0) {
      return messages.join(" | ");
    }
  }

  return fallback;
}
