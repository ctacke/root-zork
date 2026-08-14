import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import checker from "vite-plugin-checker";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appVersion = JSON.parse(
  readFileSync(resolve(__dirname, "../root-manifest.json"), "utf8")
).version;

export default defineConfig({
  server: {
    open: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), checker({ typescript: true })],
});
