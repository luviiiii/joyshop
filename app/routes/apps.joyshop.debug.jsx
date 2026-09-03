import { authenticate } from "../shopify.server";
import db from "../db.server";
import fs from "fs";
import path from "path";

/*
 * TEMPORARY DIAGNOSTIC ROUTE.
 * Visit /apps/joyshop/debug on your storefront (while logged in,
 * so the app proxy signature validates) to see what Prisma models
 * are actually available in the running production server.
 *
 * DELETE THIS FILE once the AmbassadorApplication issue is fixed —
 * it's not meant to stay in the app long-term.
 */

export const loader = async ({ request }) => {
  try {
    await authenticate.public.appProxy(request);

    const modelNames = Object.keys(db).filter(
      (key) => !key.startsWith("_") && !key.startsWith("$")
    );

    let schemaHasModel = false;
    let schemaReadError = null;

    try {
      const schemaPath = path.join(
        process.cwd(),
        "prisma",
        "schema.prisma"
      );

      const schemaContent = fs.readFileSync(schemaPath, "utf-8");

      schemaHasModel = schemaContent.includes(
        "model AmbassadorApplication"
      );
    } catch (error) {
      schemaReadError = String(error);
    }

    return Response.json({
      prismaModelsAvailable: modelNames,
      hasAmbassadorApplicationModel: modelNames.includes(
        "ambassadorApplication"
      ),
      schemaFileHasModel: schemaHasModel,
      schemaReadError,
      nodeEnv: process.env.NODE_ENV,
      cwd: process.cwd(),
    });
  } catch (error) {
    return Response.json(
      {
        error: "Diagnostic route failed",
        message: String(error),
      },
      { status: 500 }
    );
  }
};
