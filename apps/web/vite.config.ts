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
}));
