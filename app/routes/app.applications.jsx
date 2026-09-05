import { useLoaderData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Fetches fresh, current URLs for a batch of Shopify File IDs.
 * File processing is asynchronous, so we look these up at render
 * time rather than storing a URL that might not be ready yet.
 */
async function fetchFileUrls(admin, fileIds) {
  const ids = fileIds.filter(Boolean);

  if (ids.length === 0) {
    return {};
  }

  const response = await admin.graphql(
    `#graphql
    query GetFiles($ids: [ID!]!) {
      nodes(ids: $ids) {
        id
        ... on GenericFile {
          url
        }
        ... on MediaImage {
          image {
            url
          }
        }
      }
    }`,
    {
      variables: { ids },
    }
  );

  const result = await response.json();

  const nodes = result?.data?.nodes || [];

  const map = {};

  nodes.forEach((node) => {
    if (!node) return;

    map[node.id] = node.url || node.image?.url || null;
  });

  return map;
}

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const shop = session.shop;

  const applications = await db.ambassadorApplication.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  const fileIds = [];

  applications.forEach((application) => {
    if (application.panFileId) fileIds.push(application.panFileId);
    if (application.aadhaarFileId) fileIds.push(application.aadhaarFileId);
    if (application.cancelledChequeFileId)
      fileIds.push(application.cancelledChequeFileId);
  });

  const fileUrls = await fetchFileUrls(admin, fileIds);

  const applicationsWithUrls = applications.map((application) => ({
    ...application,
    panFileUrl: application.panFileId
      ? fileUrls[application.panFileId] || null
      : null,
    aadhaarFileUrl: application.aadhaarFileId
      ? fileUrls[application.aadhaarFileId] || null
      : null,
    cancelledChequeFileUrl: application.cancelledChequeFileId
      ? fileUrls[application.cancelledChequeFileId] || null
      : null,
  }));

  return {
    shop,
    applications: applicationsWithUrls,
  };
};

function createReferralCode(name) {
  const cleanName =
    String(name || "AMBASSADOR")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 8) || "AMBASSADOR";

  const randomPart = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  return `${cleanName}-${randomPart}`;
}

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  const formData = await request.formData();

  const applicationId = formData.get("applicationId");
  const decision = formData.get("decision");

  if (!applicationId || !decision) {
    return {
      success: false,
      error: "Missing application or decision.",
    };
  }

  const application = await db.ambassadorApplication.findFirst({
    where: { id: String(applicationId), shop },
  });

  if (!application) {
    return {
      success: false,
      error: "Application not found.",
    };
  }

  if (decision === "approve") {
    const existingAmbassador = await db.ambassador.findFirst({
      where: { shop, customerId: application.customerId },
    });

    if (existingAmbassador) {
      await db.ambassadorApplication.update({
        where: { id: application.id },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
        },
      });

      return { success: true };
    }

    let referralCode;
    let codeExists = true;

    while (codeExists) {
      referralCode = createReferralCode(application.name);

      const existingCode = await db.ambassador.findUnique({
        where: { referralCode },
      });

      codeExists = Boolean(existingCode);
    }

    await db.ambassador.create({
      data: {
        shop,
        customerId: application.customerId,
        name: application.name,
        email: application.email,
        phone: application.phone,
        referralCode,
        status: "ACTIVE",
      },
    });

    await db.ambassadorApplication.update({
      where: { id: application.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
      },
    });

    return { success: true };
  }

  if (decision === "reject") {
    await db.ambassadorApplication.update({
      where: { id: application.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
      },
    });

    return { success: true };
  }

  return {
    success: false,
    error: "Unknown decision.",
  };
};

function statusTone(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "critical";
  return "warning";
}

export default function Applications() {
  const { applications } = useLoaderData();

  const pending = applications.filter((app) => app.status === "PENDING");
  const reviewed = applications.filter((app) => app.status !== "PENDING");

  return (
    <s-page heading="Ambassador Applications">

      <s-section heading="Pending Review">

        {pending.length === 0 ? (
          <s-banner tone="info">
            No pending applications right now.
          </s-banner>
        ) : (
          <s-stack direction="block" gap="base">

            {pending.map((application) => (
              <s-card key={application.id}>

                <s-stack direction="block" gap="base">

                  <s-stack
                    direction="inline"
                    gap="base"
                    align="center"
                    justify="space-between"
                  >
                    <s-stack direction="block" gap="small">
                      <s-heading>{application.name}</s-heading>
                      <s-text>{application.email}</s-text>
                      {application.phone && (
                        <s-text>{application.phone}</s-text>
                      )}
                    </s-stack>

                    <s-badge tone={statusTone(application.status)}>
                      {application.status}
                    </s-badge>
                  </s-stack>

                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="small">
                      <s-text>
                        PAN Number: {application.panNumber || "—"}
                      </s-text>

                      {application.panFileUrl ? (
                        <s-link href={application.panFileUrl} target="_blank">
                          View PAN Photo
                        </s-link>
                      ) : (
                        <s-text>PAN photo processing...</s-text>
                      )}
                    </s-stack>

                    <s-stack direction="block" gap="small">
                      <s-text>
                        Aadhaar Number: {application.aadhaarNumber || "—"}
                      </s-text>

                      {application.aadhaarFileUrl ? (
                        <s-link
                          href={application.aadhaarFileUrl}
                          target="_blank"
                        >
                          View Aadhaar Photo
                        </s-link>
                      ) : (
                        <s-text>Aadhaar photo processing...</s-text>
                      )}
                    </s-stack>

                    <s-stack direction="block" gap="small">
                      <s-text>Cancelled Cheque</s-text>

                      {application.cancelledChequeFileUrl ? (
                        <s-link
                          href={application.cancelledChequeFileUrl}
                          target="_blank"
                        >
                          View Cheque Photo
                        </s-link>
                      ) : (
                        <s-text>Cheque photo processing...</s-text>
                      )}
                    </s-stack>
                  </s-stack>

                  <s-stack direction="inline" gap="base">

                    <Form method="post">
                      <input
                        type="hidden"
                        name="applicationId"
                        value={application.id}
                      />
                      <input type="hidden" name="decision" value="approve" />
                      <s-button type="submit" variant="primary">
                        Approve
                      </s-button>
                    </Form>

                    <Form method="post">
                      <input
                        type="hidden"
                        name="applicationId"
                        value={application.id}
                      />
                      <input type="hidden" name="decision" value="reject" />
                      <s-button type="submit" tone="critical">
                        Reject
                      </s-button>
                    </Form>

                  </s-stack>

                </s-stack>

              </s-card>
            ))}

          </s-stack>
        )}

      </s-section>

      <s-section heading="Reviewed Applications">

        {reviewed.length === 0 ? (
          <s-banner tone="info">
            No applications have been reviewed yet.
          </s-banner>
        ) : (
          <s-stack direction="block" gap="base">

            {reviewed.map((application) => (
              <s-card key={application.id}>

                <s-stack
                  direction="inline"
                  gap="base"
                  align="center"
                  justify="space-between"
                >
                  <s-stack direction="block" gap="small">
                    <s-heading>{application.name}</s-heading>
                    <s-text>{application.email}</s-text>
                  </s-stack>

                  <s-badge tone={statusTone(application.status)}>
                    {application.status}
                  </s-badge>
                </s-stack>

              </s-card>
            ))}

          </s-stack>
        )}

      </s-section>

    </s-page>
  );
}
