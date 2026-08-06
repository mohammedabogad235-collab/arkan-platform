import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiTarget = env.VITE_API_URL || "https://arkan-app-1cme.onrender.com";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      // Firebase Hosting سيستخدم هذا المجلد (راجع firebase.json)
      outDir: "dist/public",
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
