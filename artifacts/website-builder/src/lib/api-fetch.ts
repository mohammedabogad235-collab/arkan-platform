/**
 * API Fetch Wrapper
 * - يحل مشكلة "Failed to fetch" في الإنتاج عندما تكون طلبات الفرونت `/api/...` نسبية
 * - يجبر الـ Base URL على الإنتاج دائماً
 * - يضيفه تلقائياً فقط قبل أي مسار يبدأ بـ `/api`
 */

const API_BASE_URL = "https://arkan-platform.onrender.com";

export function resolveApiUrl(url: string): string {
  if (!url.startsWith("/api")) return url;
  return `${API_BASE_URL}${url}`;
}

/**
 * نفس `fetch` لكن:
 * - يحول `/api/...` إلى عنوان مطلق على سيرفر الإنتاج
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
