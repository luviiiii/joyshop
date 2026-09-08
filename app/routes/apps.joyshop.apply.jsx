import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Uploads a single file to Shopify Files via the Admin API using the
 * standard 2-step staged upload flow, and returns the resulting
 * Shopify file ID (GID).
 */
async function stageAndUploadFile(admin, file) {
  const filename = file.name || "upload";
  const mimeType = file.type || "application/octet-stream";
  const fileSize = String(file.size);

  const stagedResponse = await admin.graphql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: [
          {
            resource: "FILE",
            filename,
            mimeType,
            httpMethod: "POST",
            fileSize,
          },
        ],
      },
    }
  );

  const stagedResult = await stagedResponse.json();

  const target =
    stagedResult?.data?.stagedUploadsCreate?.stagedTargets?.[0];

  const stagedErrors =
    stagedResult?.data?.stagedUploadsCreate?.userErrors;

  if (!target || (stagedErrors && stagedErrors.length)) {
    throw new Error(
      "Failed to prepare file upload: " +
        (stagedErrors?.map((error) => error.message).join(", ") ||
          "unknown error")
    );
  }

  const uploadForm = new FormData();

  target.parameters.forEach((param) => {
    uploadForm.append(param.name, param.value);
  });

  uploadForm.append("file", file, filename);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    throw new Error("File upload to storage failed.");
  }

  const fileCreateResponse = await admin.graphql(
    `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        files: [
          {
            alt: filename,
            contentType: "FILE",
            originalSource: target.resourceUrl,
          },
        ],
      },
    }
  );

  const fileCreateResult = await fileCreateResponse.json();

  const createdFile = fileCreateResult?.data?.fileCreate?.files?.[0];
  const createErrors = fileCreateResult?.data?.fileCreate?.userErrors;

  if (!createdFile || (createErrors && createErrors.length)) {
    throw new Error(
      "Failed to register file: " +
        (createErrors?.map((error) => error.message).join(", ") ||
          "unknown error")
    );
  }

  return createdFile.id;
}

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.public.appProxy(request);

    const url = new URL(request.url);

    const shop = url.searchParams.get("shop");
    const customerId = url.searchParams.get("logged_in_customer_id");

    if (!shop || !customerId) {
      return Response.json(
        {
          success: false,
          error: "Please log in to apply.",
        },
        { status: 401 }
      );
    }

    if (!admin) {
      return Response.json(
        {
          success: false,
          error: "Store authorization is unavailable.",
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const panNumber = String(formData.get("panNumber") || "")
      .trim()
      .toUpperCase();
    const aadhaarNumber = String(
      formData.get("aadhaarNumber") || ""
    ).trim();
    const agreedToTerms = formData.get("agreedToTerms") === "true";

    const panFile = formData.get("panFile");
    const aadhaarFile = formData.get("aadhaarFile");
    const cancelledChequeFile = formData.get("cancelledChequeFile");

    if (!name || !email) {
      return Response.json(
        {
          success: false,
          error: "Name and email are required.",
        },
        { status: 400 }
      );
    }

    const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (!panNumber || !PAN_PATTERN.test(panNumber)) {
      return Response.json(
        {
          success: false,
          error:
            "Enter a valid PAN number (format: ABCDE1234F).",
        },
        { status: 400 }
      );
    }

    const AADHAAR_PATTERN = /^[0-9]{12}$/;

    if (!aadhaarNumber || !AADHAAR_PATTERN.test(aadhaarNumber)) {
      return Response.json(
        {
          success: false,
          error: "Enter a valid 12-digit Aadhaar number.",
        },
        { status: 400 }
      );
    }

    if (!agreedToTerms) {
      return Response.json(
        {
          success: false,
          error: "You must agree to the terms and conditions.",
        },
        { status: 400 }
      );
    }

    if (!panFile || !(panFile instanceof Blob) || panFile.size === 0) {
      return Response.json(
        {
          success: false,
          error: "PAN card photo is required.",
        },
        { status: 400 }
      );
    }

    if (
      !aadhaarFile ||
      !(aadhaarFile instanceof Blob) ||
      aadhaarFile.size === 0
    ) {
      return Response.json(
        {
          success: false,
          error: "Aadhaar card photo is required.",
        },
        { status: 400 }
      );
    }

    if (
      !cancelledChequeFile ||
      !(cancelledChequeFile instanceof Blob) ||
      cancelledChequeFile.size === 0
    ) {
      return Response.json(
        {
          success: false,
          error: "Cancelled cheque photo is required.",
        },
        { status: 400 }
      );
    }

    /*
     * Already an active ambassador — no need to apply again.
     */

    const existingAmbassador = await db.ambassador.findFirst({
      where: { shop, customerId },
    });

    if (existingAmbassador) {
      return Response.json({
        success: true,
        alreadyAmbassador: true,
      });
    }

    /*
     * Already has a pending application — don't create a duplicate.
     */

    const existingApplication =
      await db.ambassadorApplication.findUnique({
        where: {
          shop_customerId: { shop, customerId },
        },
      });

    if (
      existingApplication &&
      existingApplication.status === "PENDING"
    ) {
      return Response.json({
        success: true,
        alreadyPending: true,
      });
    }

    const panFileId = await stageAndUploadFile(admin, panFile);
    const aadhaarFileId = await stageAndUploadFile(admin, aadhaarFile);
    const cancelledChequeFileId = await stageAndUploadFile(
      admin,
      cancelledChequeFile
    );

    const application = await db.ambassadorApplication.upsert({
      where: {
        shop_customerId: { shop, customerId },
      },
      update: {
        name,
        email,
        phone: phone || null,
        panNumber: panNumber || null,
        panFileId,
        aadhaarNumber: aadhaarNumber || null,
        aadhaarFileId,
        cancelledChequeFileId,
        agreedToTerms: true,
        status: "PENDING",
        reviewedAt: null,
        reviewNotes: null,
      },
      create: {
        shop,
        customerId,
        name,
        email,
        phone: phone || null,
        panNumber: panNumber || null,
        panFileId,
        aadhaarNumber: aadhaarNumber || null,
        aadhaarFileId,
        cancelledChequeFileId,
        agreedToTerms: true,
        status: "PENDING",
      },
    });

    console.log("========================================");
    console.log("NEW AMBASSADOR APPLICATION");
    console.log("Application ID:", application.id);
    console.log("Name:", name);
    console.log("Email:", email);
    console.log("========================================");

    return Response.json({
      success: true,
    });
  } catch (error) {
    console.error("AMBASSADOR APPLICATION ERROR:", error);

    return Response.json(
      {
        success: false,
        error: "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
};
