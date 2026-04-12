import { useQuery, useMutation } from "@tanstack/react-query";

export interface SiteSettings {
  id: number;
  phone1: string;
  phone2: string;
  email: string;
  whatsapp: string;
  address: string;
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
}

const SETTINGS_KEY = ["site-settings"] as const;

async function fetchSettings(): Promise<SiteSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

async function patchSettings(data: Partial<Omit<SiteSettings, "id">>): Promise<SiteSettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

export function useSettings() {
  return useQuery<SiteSettings>({
    queryKey: SETTINGS_KEY,
    queryFn: fetchSettings,
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateSettings() {
  return useMutation<SiteSettings, Error, Partial<Omit<SiteSettings, "id">>>({
    mutationFn: patchSettings,
  });
}

export { SETTINGS_KEY };
