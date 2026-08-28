import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-fetch";

export type SystemStatus = {
  // Web
  webMaintenanceMode: boolean;
  webMaintenanceMessage: string;
  webMaintenanceEndTime: string | null;
  webShowAppAlternative: boolean;

  // App
  appMaintenanceMode: boolean;
  appUpdateRequired: boolean;
  appStatusMessage: string;
  appMaintenanceEndTime: string | null;
  appShowWebAlternative: boolean;
  appUpdateLink: string;
};

export const SYSTEM_STATUS_KEY = ["system-status"] as const;

async function fetchSystemStatus(): Promise<SystemStatus> {
  return apiFetchJson<SystemStatus>("/api/system-status");
}

export function useSystemStatus() {
  return useQuery<SystemStatus>({
    queryKey: SYSTEM_STATUS_KEY,
    queryFn: fetchSystemStatus,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 30,
  });
}

async function postSystemStatus(data: Partial<SystemStatus>): Promise<SystemStatus> {
  return apiFetchJson<SystemStatus>("/api/system-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function useUpdateSystemStatus() {
  return useMutation<SystemStatus, Error, Partial<SystemStatus>>({
    mutationFn: postSystemStatus,
  });
}

