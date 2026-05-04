import axios from "axios";

type ApiErrorPayload = {
  detail?: unknown;
};

function normalizeDetail(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const chunks = detail
      .map((item) => normalizeDetail(item))
      .filter((item): item is string => !!item);
    return chunks.length ? chunks.join(", ") : null;
  }
  if (typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    if (typeof obj.msg === "string" && obj.msg.trim()) return obj.msg;
    return null;
  }
  return null;
}

export function getApiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const payload = error.response?.data as ApiErrorPayload | undefined;
  return (
    normalizeDetail(payload?.detail) ||
    (typeof error.response?.statusText === "string" ? error.response?.statusText : null) ||
    fallback
  );
}
