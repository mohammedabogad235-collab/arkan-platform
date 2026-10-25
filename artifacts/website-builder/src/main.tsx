import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() ?? "";
const apiOrigin = /^https?:\/\//i.test(configuredApiUrl)
  ? configuredApiUrl.replace(/\/+$/, "")
  : null;
setBaseUrl(apiOrigin);

createRoot(document.getElementById("root")!).render(<App />);
