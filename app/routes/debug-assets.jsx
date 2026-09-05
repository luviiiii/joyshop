import fs from "fs";
import path from "path";

/*
 * TEMPORARY DIAGNOSTIC ROUTE.
 * Visit /debug-assets directly (admin-only route, loads without
 * Shopify auth since it's not under app.*) to see what files
 * actually exist in the built client assets directory on the
 * live server.
 *
 * DELETE THIS FILE once the asset-loading issue is resolved.
 */

export const loader = async () => {
  const results = {};

  const candidatePaths = [
    path.join(process.cwd(), "build", "client", "assets"),
    path.join(process.cwd(), "build", "client"),
    path.join(process.cwd(), "public", "build", "assets"),
  ];

  for (const candidate of candidatePaths) {
    try {
      const files = fs.readdirSync(candidate);
      results[candidate] = {
        exists: true,
        fileCount: files.length,
        sampleFiles: files.slice(0, 20),
        hasEntryClient: files.some((f) => f.startsWith("entry.client")),
      };
    } catch (error) {
      results[candidate] = {
        exists: false,
        error: String(error.message || error),
      };
    }
  }

  return Response.json({
    cwd: process.cwd(),
    results,
  });
};
