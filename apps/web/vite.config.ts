import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Bind-mounted source on a Windows host doesn't deliver inotify events to
    // the Linux container, so the file watcher misses edits. Enable chokidar
    // polling when CHOKIDAR_USEPOLLING=true (set for the dockerized dev server);
    // left off for native host dev to avoid the polling CPU cost.
    watch:
      process.env.CHOKIDAR_USEPOLLING === "true"
        ? { usePolling: true, interval: 200 }
        : undefined,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Enable importing from @queuemed/core
      "@queuemed/core": path.resolve(__dirname, "../../packages/core/src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // NOTE: do NOT pre-bundle "@queuemed/core" here. It is aliased to source
    // (packages/core/src) and edited in-place; pre-bundling snapshots it into
    // .vite/deps and the snapshot goes stale when a new export is added (Vite
    // doesn't invalidate it), causing "does not provide an export named ..."
    // at runtime. Let Vite process it as source like the rest of the app graph.
    include: ["@tanstack/react-table"],
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
