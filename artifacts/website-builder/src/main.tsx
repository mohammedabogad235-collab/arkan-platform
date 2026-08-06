import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

const apiUrl = (
  import.meta.env.VITE_API_URL || "https://arkan-app-1cme.onrender.com"
).replace(/\/+$/, "");

setBaseUrl(apiUrl);

const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const rewrittenUrl = rawUrl.startsWith("/api")
    ? `${apiUrl}${rawUrl}`
    : rawUrl.startsWith(`${window.location.origin}/api`)
      ? `${apiUrl}${rawUrl.slice(window.location.origin.length)}`
      : rawUrl;

  const nextInput = rewrittenUrl === rawUrl ? input : rewrittenUrl;
  const nextInit =
    rewrittenUrl.includes("/api") && !init?.credentials
      ? { ...init, credentials: "include" as const }
      : init;

  return originalFetch(nextInput, nextInit);
}) as typeof fetch;

createRoot(document.getElementById("root")!).render(<App />);
