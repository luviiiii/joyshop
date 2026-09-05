import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(
  process.env.SHOPIFY_APP_URL || "http://localhost"
).hostname;

let hmrConfig;

if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  /*
   * IMPORTANT:
   * Without this, Vite emits relative asset URLs like
   * "/assets/entry.client-xxxx.js". That works fine when the
   * page is loaded directly from this app's own domain (e.g.
   * the embedded admin app), but breaks any route loaded
   * through Shopify's App Proxy (e.g. apps.joyshop.dashboard),
   * because the browser sees that page as being served from
   * the STOREFRONT domain (justorganik.co), not this app's
   * domain — so relative asset paths 404.
   *
   * Setting an absolute base here makes every generated
   * <script>/<link> tag point at this app's real domain
   * regardless of which domain is displaying the page.
   */
  base: process.env.SHOPIFY_APP_URL
    ? `${process.env.SHOPIFY_APP_URL.replace(/\/$/, "")}/`
    : "/",

  server: {
    allowedHosts: [host],

    cors: {
      preflightContinue: true,
    },

    port: Number(process.env.PORT || 3000),

    hmr: hmrConfig,

    fs: {
      allow: ["app", "node_modules"],
    },
  },

  plugins: [
    reactRouter(),
    tsconfigPaths(),
  ],

  build: {
    assetsInlineLimit: 0,
  },

  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
});