import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { Capacitor } from "@capacitor/core";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
const apiOrigin = /^https?:\/\//i.test(configuredApiUrl)
  ? configuredApiUrl.replace(/\/+$/, "")
  : null;
setBaseUrl(Capacitor.getPlatform() === "web"
  ? apiOrigin
  : "https://arkan-platform.onrender.com");

createRoot(document.getElementById("root")!).render(<App />);
