import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

function normalizeEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getSupabaseEnv() {
  const url = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
  const anonKey = normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

  return {
    url,
    anonKey,
    hasUrl: Boolean(url),
    hasAnonKey: Boolean(anonKey),
  };
}

export function hasSupabaseEnv(): boolean {
  const env = getSupabaseEnv();
  return env.hasUrl && env.hasAnonKey && isValidHttpUrl(env.url);
}

export function getSupabaseClient(): SupabaseClient {
  const env = getSupabaseEnv();

  if (!env.hasUrl || !env.hasAnonKey) {
    console.error("[Supabase] Missing Vite env vars", {
      hasUrl: env.hasUrl,
      hasAnonKey: env.hasAnonKey,
      expectedEnvKeys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    });

    throw new Error(
      "إعدادات Supabase غير مكتملة في الواجهة الأمامية. تأكد من وجود VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY."
    );
  }

  if (!isValidHttpUrl(env.url)) {
    console.error("[Supabase] Invalid VITE_SUPABASE_URL", {
      url: env.url,
    });

    throw new Error("قيمة VITE_SUPABASE_URL غير صالحة.");
  }

  if (!supabaseClient) {
    console.info("[Supabase] Creating browser client", {
      urlOrigin: new URL(env.url).origin,
      hasAnonKey: true,
    });

    supabaseClient = createClient(env.url, env.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseClient;
}
