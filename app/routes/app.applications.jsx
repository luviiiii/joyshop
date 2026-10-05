import { useState } from "react";
import { useLoaderData, Form } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const IST_OFFSET_MS = 330 * 60 * 1000;

function istMonthKey(value) {
  const d = new Date(new Date(value).getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

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
          fileStatus
          fileErrors {
            code
            message
          }
        }
        ... on MediaImage {
          image {
            url
          }
          fileStatus
          fileErrors {
            code
            message
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
    monthKey: istMonthKey(application.createdAt),
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

  // Months that actually have applications, newest first
  const months = [...new Set(applicationsWithUrls.map((a) => a.monthKey))]
    .sort()
    .reverse()
    .map((key) => ({ value: key, label: monthLabel(key) }));

  return {
    shop,
    applications: applicationsWithUrls,
    months,
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

/* -------------------------------- */
/* KYC PACK DOWNLOAD */
/* -------------------------------- */

function KycPackDownload({ applications, months }) {
  const [month, setMonth] = useState(months[0]?.value || "all");
  const [status, setStatus] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const matching = applications.filter(
    (a) =>
      (month === "all" || a.monthKey === month) &&
      (status === "ALL" || a.status === status)
  ).length;

  async function download() {
    setBusy(true);
    setMessage(null);

    try {
      // Embedded admin requests must carry the Shopify session token
      const token = await window.shopify?.idToken?.();

      const response = await fetch(
        `/app/applications/export?month=${encodeURIComponent(month)}&status=${encodeURIComponent(status)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          response.status === 404 ? text : `Export failed (error ${response.status}).`
        );
      }

      if (!(response.headers.get("content-type") || "").includes("zip")) {
        throw new Error("Export failed — please reload the page and try again.");
      }

      const disposition = response.headers.get("content-disposition") || "";
      const fileName =
        disposition.match(/filename="([^"]+)"/)?.[1] || `JOYSHOP-KYC-${month}.zip`;

      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);

      setMessage({ type: "success", text: `Downloaded ${fileName}` });
    } catch (error) {
      setMessage({ type: "error", text: error.message || "Export failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.title}>Download KYC pack</div>
      <div style={styles.subtitle}>
        One ZIP with a spreadsheet of everyone&rsquo;s details and a folder of
        documents (PAN, Aadhaar, cancelled cheque) for each ambassador.
      </div>

      <div style={styles.row}>
        <label style={styles.label}>
          Month submitted
          <select value={month} onChange={(e) => setMonth(e.target.value)} style={styles.select}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            <option value="all">All time</option>
          </select>
        </label>

        <label style={styles.label}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.select}>
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </label>

        <button
          type="button"
          onClick={download}
          disabled={busy || matching === 0}
          style={busy || matching === 0 ? styles.buttonDisabled : styles.button}
        >
          {busy ? "Preparing ZIP…" : `⬇ Download (${matching})`}
        </button>
      </div>

      {busy && (
        <div style={styles.hint}>
          Collecting documents from Shopify — this can take a little while for a busy month.
        </div>
      )}

      {message && (
        <div style={message.type === "success" ? styles.success : styles.error}>
          {message.text}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- */
/* PAGE */
/* -------------------------------- */

export default function Applications() {
  const { applications, months } = useLoaderData();

  const pending = applications.filter((app) => app.status === "PENDING");
  const reviewed = applications.filter((app) => app.status !== "PENDING");

  return (
    <s-page heading="Ambassador Applications">

      {applications.length > 0 && (
        <s-section>
          <KycPackDownload applications={applications} months={months} />
        </s-section>
      )}

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

/* -------------------------------- */
/* STYLES */
/* -------------------------------- */

const styles = {
  card: {
    background: "#ffffff",
    border: "1px solid #e4ebe6",
    borderRadius: "12px",
    padding: "18px 20px",
  },
  title: { fontSize: "16px", fontWeight: 700, color: "#17221b" },
  subtitle: { marginTop: "4px", fontSize: "13px", color: "#6b7a70", lineHeight: 1.5 },
  row: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "14px",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "12px",
    fontWeight: 700,
    color: "#4b5750",
  },
  select: {
    height: "36px",
    minWidth: "170px",
    border: "1px solid #dce4df",
    borderRadius: "8px",
    padding: "0 10px",
    background: "#fff",
    fontSize: "13px",
  },
  button: {
    height: "36px",
    padding: "0 16px",
    border: "none",
    borderRadius: "8px",
    background: "#08783d",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonDisabled: {
    height: "36px",
    padding: "0 16px",
    border: "none",
    borderRadius: "8px",
    background: "#aab8b0",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "not-allowed",
  },
  hint: { marginTop: "10px", fontSize: "12px", color: "#6b7a70" },
  success: {
    marginTop: "12px",
    padding: "10px 14px",
    borderRadius: "8px",
    background: "#e5f7eb",
    color: "#16803c",
    fontSize: "13px",
  },
  error: {
    marginTop: "12px",
    padding: "10px 14px",
    borderRadius: "8px",
    background: "#fff5f5",
    color: "#b42318",
    fontSize: "13px",
  },
};
