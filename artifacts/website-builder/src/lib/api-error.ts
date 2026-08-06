export function getApiErrorData(error: unknown): any | null {
  const err = error as any;
  return err?.data ?? err?.response?.data ?? null;
}

export function getApiErrorStatus(error: unknown): number | null {
  const err = error as any;
  return typeof err?.status === "number"
    ? err.status
    : typeof err?.response?.status === "number"
      ? err.response.status
      : null;
}

