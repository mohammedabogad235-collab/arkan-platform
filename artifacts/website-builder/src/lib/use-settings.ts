import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-fetch";

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
  requireDeposit: boolean;
  depositPercentageValue: number;
  termsAndConditions: string;
  privacyPolicy: string;
  emailUser?: string;
  emailPassConfigured?: boolean;
}

const SETTINGS_KEY = ["site-settings"] as const;
type UpdateSiteSettings = Partial<Omit<SiteSettings, "id" | "emailPassConfigured">> & { emailPass?: string };

async function fetchSettings(): Promise<SiteSettings> {
  return apiFetchJson<SiteSettings>("/api/settings");
}

async function patchSettings(data: UpdateSiteSettings): Promise<SiteSettings> {
  return apiFetchJson<SiteSettings>("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function useSettings() {
  return useQuery<SiteSettings>({
    queryKey: SETTINGS_KEY,
    queryFn: fetchSettings,
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateSettings() {
  return useMutation<SiteSettings, Error, UpdateSiteSettings>({
    mutationFn: patchSettings,
  });
}

export { SETTINGS_KEY };
