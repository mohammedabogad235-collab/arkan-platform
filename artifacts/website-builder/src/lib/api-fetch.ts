import { Capacitor } from "@capacitor/core";

/** Resolves API requests against the configured remote API, or same-origin `/api`. */

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
const configuredBaseUrl = /^https?:\/\//i.test(configuredApiUrl)
  ? configuredApiUrl.replace(/\/+$/, "")
  : "";
const NATIVE_API_URL = "https://arkan-platform.onrender.com";
const API_BASE_URL = Capacitor.getPlatform() === "web" ? configuredBaseUrl : NATIVE_API_URL;

export function resolveApiUrl(url: string): string {
  if (!url.startsWith("/api")) return url;
  return `${API_BASE_URL}${url}`;
}

/** Uses cookie-based authentication for both same-origin and cross-origin deployments. */
export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (typeof input === "string") {
    input = resolveApiUrl(input);
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
  });
}

/** Parses JSON and surfaces API errors with their server-provided messages. */
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
