/**
 * API Fetch Wrapper
 * - يحل مشكلة "Failed to fetch" في الإنتاج عندما تكون طلبات الفرونت `/api/...` نسبية
 * - يقرأ الـ Base URL من `import.meta.env.VITE_API_URL`
 * - يضيفه تلقائياً فقط قبل أي مسار يبدأ بـ `/api`
 */

function normalizeBaseUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

const API_BASE_URL = normalizeBaseUrl((import.meta as any)?.env?.VITE_API_URL);

export function resolveApiUrl(url: string): string {
  if (!url.startsWith("/api")) return url;
  if (!API_BASE_URL) return url; // في التطوير مع proxy تظل شغالة
  return `${API_BASE_URL}${url}`;
}

/**
 * نفس `fetch` لكن:
 * - يحول `/api/...` إلى `VITE_API_URL + /api/...`
 * - يضع `credentials: "include"` افتراضياً (مهم للجلسات والكوكيز)
 */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (typeof input === "string") {
    input = resolveApiUrl(input);
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
  });
}

/**
 * نسخة JSON جاهزة: ترجع body كـ JSON وتعمل throw مع رسالة مفهومة عند الخطأ.
 */
export async function apiFetchJson<T = any>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await apiFetch(url, init);
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  }
  return data as T;
}

