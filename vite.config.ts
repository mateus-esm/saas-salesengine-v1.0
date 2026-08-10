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
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // https://vitest.dev/config/
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    // Edge functions are Deno, not Node: their tests import from
    // https://deno.land/... which vitest cannot resolve. They are run by
    // `deno test`, so keep them out of the vitest glob — otherwise the whole
    // suite reports red over a file that was never meant for this runner.
    exclude: ["**/node_modules/**", "**/dist/**", "supabase/functions/**"],
  },
}));
