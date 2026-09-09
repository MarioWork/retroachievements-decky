import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const mock = (file: string): string =>
  fileURLToPath(new URL(`./src/dev/mocks/${file}`, import.meta.url));

// Harness-only config. `yarn dev` renders the real views/hooks/services in a browser by
// swapping the two Decky packages for local stand-ins. Nothing under src/ outside src/dev
// knows this file exists -- there are no `if (dev)` branches in shipping code.
export default defineConfig({
  root: "src/dev",
  plugins: [react()],
  resolve: {
    alias: {
      "@decky/ui": mock("decky-ui.tsx"),
      "@decky/api": mock("decky-api.ts"),
    },
  },
  server: {
    port: 5273,
    // Browsers enforce CORS against retroachievements.org; on the Deck the Python
    // backend makes this call instead. Same URL either way.
    proxy: {
      "/API": {
        target: "https://retroachievements.org",
        changeOrigin: true,
      },
    },
  },
});
