import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Enable importing from @queuemed/core
      "@queuemed/core": path.resolve(__dirname, "../../packages/core/src"),
    },
  },
  // Optimize deps for workspace packages
  optimizeDeps: {
    include: ["@queuemed/core", "@tanstack/react-table"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");

          if (normalizedId.includes("node_modules")) {
            if (normalizedId.includes("react-router")) return "vendor-router";
            if (normalizedId.includes("@tanstack")) return "vendor-query";
            if (normalizedId.includes("@supabase")) return "vendor-supabase";
            if (normalizedId.includes("i18next") || normalizedId.includes("react-i18next")) return "vendor-i18n";
            if (normalizedId.includes("date-fns")) return "vendor-date";
            if (normalizedId.includes("lucide-react")) return "vendor-icons";
            if (normalizedId.includes("recharts")) return "vendor-charts";
            if (normalizedId.includes("react") || normalizedId.includes("scheduler")) return "vendor-react";
            return "vendor-misc";
          }

          if (normalizedId.includes("/src/pages/clinic/") || normalizedId.includes("/src/components/clinic/")) {
            return "feature-clinic";
          }
          if (normalizedId.includes("/src/pages/patient/")) {
            return "feature-patient";
          }
          if (normalizedId.includes("/src/components/booking/")) {
            return "feature-booking";
          }
          if (normalizedId.includes("/src/services/queue/")) {
            return "feature-queue";
          }
          if (normalizedId.includes("/src/services/ml/")) {
            return "feature-ml";
          }

          return undefined;
        },
      },
    },
  },
}));
