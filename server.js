import { createRequestHandler } from "@react-router/express";
import express from "express";
import * as build from "./build/server/index.js";

const app = express();

/*
 * Serve built client assets with an explicit CORS header.
 *
 * Pages loaded through Shopify's App Proxy (e.g.
 * /apps/joyshop/dashboard) are displayed on the STOREFRONT
 * domain (justorganik.com), while the actual JS/CSS files live
 * on THIS app's domain (Render). Browsers block that
 * cross-origin script load unless the response explicitly
 * allows it — this middleware adds that permission.
 */
app.use(
  "/assets",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static("build/client/assets", {
    immutable: true,
    maxAge: "1y",
  })
);

// Any other static files in build/client (favicon, etc.)
app.use(express.static("build/client", { maxAge: "1h" }));

// Everything else goes to the React Router app itself.
app.use(
  createRequestHandler({
    build,
  })
);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
