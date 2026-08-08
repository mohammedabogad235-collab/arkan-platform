import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

const apiUrl = (import.meta.env.VITE_API_URL || "/api").replace(/\/+$/, "");
const apiOrigin = apiUrl === "/api" ? "" : apiUrl;

setBaseUrl(apiOrigin || null);

const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const rewrittenUrl = rawUrl.startsWith("/api")
    ? `${apiOrigin}${rawUrl}`
    : rawUrl.startsWith(`${window.location.origin}/api`)
      ? `${apiOrigin}${rawUrl.slice(window.location.origin.length)}`
      : rawUrl;

  const nextInput = rewrittenUrl === rawUrl ? input : rewrittenUrl;
  const nextInit =
    rewrittenUrl.includes("/api") && !init?.credentials
      ? { ...init, credentials: "include" as const }
      : init;

  return originalFetch(nextInput, nextInit);
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(<App />);
