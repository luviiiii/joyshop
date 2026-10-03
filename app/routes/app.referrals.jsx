import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/* -------------------------------- */
/* LOADER */
/* -------------------------------- */

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const [referrals, ambassadors] = await Promise.all([
    db.referral.findMany({
      where: { shop: session.shop },
      include: { ambassador: true, commissions: true },
      orderBy: { createdAt: "desc" },
    }),
    db.ambassador.findMany({
      where: { shop: session.shop },
      select: { id: true, name: true, referralCode: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return Response.json({ referrals, ambassadors });
};

/* -------------------------------- */
/* ACTION (add / delete) */
/* -------------------------------- */

const fail = (intent, error, status = 400) =>
  Response.json({ ok: false, intent, error }, { status });

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  /* ---------- DELETE ---------- */
  if (intent === "delete") {
    const referralId = String(form.get("referralId") || "");

    const referral = await db.referral.findFirst({
      where: { id: referralId, shop },
      include: { _count: { select: { commissions: true } } },
    });

    if (!referral) return fail(intent, "Referral not found.", 404);

    // Commissions are linked with ON DELETE CASCADE, so deleting this
    // referral would silently wipe the ambassador's earnings. Block it.
    if (referral._count.commissions > 0) {
      return fail(
        intent,
        `${referral.referredName || "This customer"} has ${referral._count.commissions} commission(s). Reject or remove those commissions first, then delete the referral.`
      );
    }

    await db.referral.delete({ where: { id: referral.id } });

    return Response.json({
      ok: true,
      intent,
      message: `Referral for ${referral.referredName || "customer"} deleted.`,
    });
  }

  /* ---------- ADD ---------- */
  if (intent === "add") {
    const ambassadorId = String(form.get("ambassadorId") || "");
    const lookupType = String(form.get("lookupType") || "phone");
    const lookupValue = String(form.get("lookupValue") || "").trim();
    const joinedDate = String(form.get("joinedAt") || "");

    if (!ambassadorId) return fail(intent, "Please choose an ambassador.");
    if (!lookupValue) return fail(intent, "Please enter the customer's details.");

    const ambassador = await db.ambassador.findFirst({
      where: { id: ambassadorId, shop },
    });
    if (!ambassador) return fail(intent, "Ambassador not found.");

    const lookup = await findShopifyCustomer(admin, lookupType, lookupValue);
    if (lookup.error) return fail(intent, lookup.error);
    const customer = lookup.customer;

    // An ambassador can't refer themselves
    if (
      ambassador.customerId &&
      String(ambassador.customerId).split("/").pop() === customer.numericId
    ) {
      return fail(intent, "An ambassador cannot be referred by themselves.");
    }

    // One referral per customer
    const existing = await db.referral.findFirst({
      where: { shop, referredCustomerId: customer.numericId },
      include: { ambassador: true },
    });
    if (existing) {
      return fail(
        intent,
        `${customer.name} is already referred by ${existing.ambassador?.name || "another ambassador"}.`
      );
    }

    let joinedAt = new Date();
    if (joinedDate) {
      const parsed = new Date(`${joinedDate}T12:00:00+05:30`);
      if (!Number.isNaN(parsed.getTime())) joinedAt = parsed;
    }

    await db.referral.create({
      data: {
        shop,
        ambassadorId: ambassador.id,
        referredCustomerId: customer.numericId,
        referredName: customer.name,
        referredEmail: customer.email,
        referredPhone: customer.phone,
        status: "ACTIVE",
        joinedAt,
      },
    });

    return Response.json({
      ok: true,
      intent,
      message: `${customer.name} added as a referral of ${ambassador.name}.`,
    });
  }

  return fail(intent, "Unknown action.");
};

/* -------------------------------- */
/* SHOPIFY CUSTOMER LOOKUP */
/* -------------------------------- */

const CUSTOMER_FIELDS = `id firstName lastName displayName email phone`;

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return raw.trim().startsWith("+") ? `+${digits}` : null;
}

function toCustomer(node) {
  const name =
    [node.firstName, node.lastName].filter(Boolean).join(" ") ||
    node.displayName ||
    "Customer";
  return {
    numericId: node.id.split("/").pop(),
    name,
    email: node.email || null,
    phone: node.phone || null,
  };
}

async function findShopifyCustomer(admin, type, value) {
  try {
    if (type === "id") {
      const id = value.replace(/\D/g, "");
      if (!id) return { error: "Enter a valid Shopify customer ID." };

      const res = await admin.graphql(
        `#graphql
        query GetCustomer($id: ID!) { customer(id: $id) { ${CUSTOMER_FIELDS} } }`,
        { variables: { id: `gid://shopify/Customer/${id}` } }
      );
      const json = await res.json();
      const node = json?.data?.customer;
      return node
        ? { customer: toCustomer(node) }
        : { error: `No Shopify customer found with ID ${id}.` };
    }

    let query;
    let isMatch;

    if (type === "email") {
      const email = value.toLowerCase();
      query = `email:"${email}"`;
      isMatch = (n) => (n.email || "").toLowerCase() === email;
    } else {
      const phone = normalizePhone(value);
      if (!phone) {
        return { error: "Enter a 10-digit mobile number or a full number with country code." };
      }
      query = `phone:${phone}`;
      isMatch = (n) => (n.phone || "") === phone;
    }

    const res = await admin.graphql(
      `#graphql
      query FindCustomer($query: String!) {
        customers(first: 5, query: $query) { nodes { ${CUSTOMER_FIELDS} } }
      }`,
      { variables: { query } }
    );
    const json = await res.json();
    const node = (json?.data?.customers?.nodes || []).find(isMatch);

    return node
      ? { customer: toCustomer(node) }
      : {
          error: `No Shopify customer found with that ${type === "email" ? "email" : "phone number"}. If they signed up just now, wait a minute and try again, or use their customer ID.`,
        };
  } catch (err) {
    console.error("Customer lookup failed", err);
    return { error: "Could not search Shopify customers. Please try again." };
  }
}

/* -------------------------------- */
/* PAGE */
/* -------------------------------- */

export default function Referrals({ loaderData }) {
  const referrals = loaderData?.referrals || [];
  const ambassadors = loaderData?.ambassadors || [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [banner, setBanner] = useState(null);

  const addFetcher = useFetcher();
  const deleteFetcher = useFetcher();

  const deletingId =
    deleteFetcher.state !== "idle"
      ? deleteFetcher.formData?.get("referralId")
      : null;

  // Show results of add / delete
  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data?.ok) {
      setShowAdd(false);
      setBanner({ type: "success", text: addFetcher.data.message });
    }
  }, [addFetcher.state, addFetcher.data]);

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data) {
      setBanner(
        deleteFetcher.data.ok
          ? { type: "success", text: deleteFetcher.data.message }
          : { type: "error", text: deleteFetcher.data.error }
      );
    }
  }, [deleteFetcher.state, deleteFetcher.data]);

  const handleDelete = (referral) => {
    const name = referral.referredName || "this customer";

    if (referral.commissions.length > 0) {
      setBanner({
        type: "error",
        text: `${name} has ${referral.commissions.length} commission(s). Reject or remove those commissions first, then delete the referral.`,
      });
      return;
    }

    const ok = window.confirm(
      `Delete the referral for ${name} (ambassador: ${referral.ambassador?.name || "-"})?\n\nAny first-order credit record issued for this referral will also be removed. This cannot be undone.`
    );
    if (!ok) return;

    deleteFetcher.submit(
      { intent: "delete", referralId: referral.id },
      { method: "post" }
    );
  };

  const filteredReferrals = referrals.filter((referral) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      !search ||
      referral.referredName?.toLowerCase().includes(searchText) ||
      referral.referredEmail?.toLowerCase().includes(searchText) ||
      referral.referredPhone?.toLowerCase().includes(searchText) ||
      referral.referredCustomerId?.toLowerCase().includes(searchText) ||
      referral.ambassador?.name?.toLowerCase().includes(searchText);

    const matchesStatus =
      statusFilter === "ALL" || referral.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalCommission = referrals.reduce(
    (total, referral) =>
      total +
      referral.commissions.reduce(
        (sum, commission) => sum + Number(commission.commissionAmount || 0),
        0
      ),
    0
  );

  const activeReferrals = referrals.filter(
    (referral) => referral.status === "ACTIVE"
  ).length;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Referrals</h1>
          <p style={styles.subtitle}>
            Customers referred by your ambassadors.
          </p>
        </div>

        <button
          type="button"
          style={styles.primaryButton}
          onClick={() => {
            setBanner(null);
            setShowAdd(true);
          }}
        >
          + Add referral
        </button>
      </div>

      {banner && (
        <div
          style={{
            ...styles.banner,
            ...(banner.type === "success"
              ? styles.bannerSuccess
              : styles.bannerError),
          }}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            style={styles.bannerClose}
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div style={styles.statsGrid}>
        <StatCard icon="👥" label="Total Referrals" value={referrals.length} />
        <StatCard icon="✓" label="Active Referrals" value={activeReferrals} />
        <StatCard
          icon="💵"
          label="Total Commission"
          value={`₹${totalCommission.toFixed(2)}`}
        />
      </div>

      {/* Main card */}
      <div style={styles.card}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <div>
            <h2 style={styles.sectionTitle}>All Referrals</h2>
            <p style={styles.sectionSubtitle}>
              Track customers connected to your ambassadors.
            </p>
          </div>

          <div style={styles.filters}>
            <div style={styles.searchWrapper}>
              <span style={styles.searchIcon}>⌕</span>
              <input
                type="text"
                placeholder="Search referrals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={styles.search}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={styles.select}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        {/* Table */}
        {filteredReferrals.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>👥</div>
            <h3 style={styles.emptyTitle}>
              {referrals.length === 0
                ? "No referrals yet"
                : "No matching referrals"}
            </h3>
            <p style={styles.emptyText}>
              {referrals.length === 0
                ? "When customers join through an ambassador, they will appear here."
                : "Try changing your search or status filter."}
            </p>
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>CUSTOMER</th>
                  <th style={styles.th}>AMBASSADOR</th>
                  <th style={styles.th}>EMAIL</th>
                  <th style={styles.th}>PHONE</th>
                  <th style={styles.th}>STATUS</th>
                  <th style={styles.th}>JOINED</th>
                  <th style={styles.th}>COMMISSION</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>ACTIONS</th>
                </tr>
              </thead>

              <tbody>
                {filteredReferrals.map((referral) => {
                  const commission = referral.commissions.reduce(
                    (sum, item) => sum + Number(item.commissionAmount || 0),
                    0
                  );
                  const isDeleting = deletingId === referral.id;

                  return (
                    <tr
                      key={referral.id}
                      style={{ ...styles.tr, opacity: isDeleting ? 0.4 : 1 }}
                    >
                      {/* Customer */}
                      <td style={styles.td}>
                        <div style={styles.customerCell}>
                          <div style={styles.avatar}>
                            {(referral.referredName || "C")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div>
                            <div style={styles.customerName}>
                              {referral.referredName || "Customer"}
                            </div>
                            <div style={styles.customerId}>
                              {referral.referredCustomerId || "-"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Ambassador */}
                      <td style={styles.td}>
                        <div style={styles.ambassadorName}>
                          {referral.ambassador?.name || "-"}
                        </div>
                        <div style={styles.code}>
                          {referral.ambassador?.referralCode || "-"}
                        </div>
                      </td>

                      {/* Email */}
                      <td style={styles.td}>{referral.referredEmail || "-"}</td>

                      {/* Phone */}
                      <td style={styles.td}>{referral.referredPhone || "-"}</td>

                      {/* Status */}
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.status,
                            ...(referral.status === "ACTIVE"
                              ? styles.activeStatus
                              : styles.inactiveStatus),
                          }}
                        >
                          <span style={styles.statusDot}>●</span>
                          {referral.status}
                        </span>
                      </td>

                      {/* Joined */}
                      <td style={styles.td}>
                        {referral.joinedAt
                          ? new Date(referral.joinedAt).toLocaleDateString(
                              "en-IN",
                              { day: "2-digit", month: "short", year: "numeric" }
                            )
                          : "-"}
                      </td>

                      {/* Commission */}
                      <td style={styles.td}>
                        <strong>₹{commission.toFixed(2)}</strong>
                      </td>

                      {/* Actions */}
                      <td style={{ ...styles.td, textAlign: "right" }}>
                        <button
                          type="button"
                          style={styles.deleteButton}
                          disabled={isDeleting}
                          onClick={() => handleDelete(referral)}
                          title={
                            referral.commissions.length > 0
                              ? "Has commissions: remove those first"
                              : "Delete referral"
                          }
                        >
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {filteredReferrals.length > 0 && (
          <div style={styles.footer}>
            Showing <strong>{filteredReferrals.length}</strong> of{" "}
            <strong>{referrals.length}</strong> referrals
          </div>
        )}
      </div>

      {showAdd && (
        <AddReferralModal
          ambassadors={ambassadors}
          fetcher={addFetcher}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------- */
/* ADD REFERRAL MODAL */
/* -------------------------------- */

function AddReferralModal({ ambassadors, fetcher, onClose }) {
  const [lookupType, setLookupType] = useState("phone");
  const submitting = fetcher.state !== "idle";
  const error =
    fetcher.state === "idle" && fetcher.data && !fetcher.data.ok
      ? fetcher.data.error
      : null;

  const today = new Date().toISOString().slice(0, 10);

  const placeholders = {
    phone: "e.g. 9958543205",
    email: "e.g. customer@gmail.com",
    id: "e.g. 31240797651309",
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.sectionTitle}>Add referral</h2>
          <button
            type="button"
            style={styles.bannerClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p style={styles.sectionSubtitle}>
          Link an existing Shopify customer to an ambassador. The customer is
          looked up in Shopify, so they must already have an account.
        </p>

        <fetcher.Form method="post" style={styles.form}>
          <input type="hidden" name="intent" value="add" />

          <label style={styles.label}>
            Ambassador
            <select name="ambassadorId" required style={styles.input} defaultValue="">
              <option value="" disabled>
                Choose an ambassador
              </option>
              {ambassadors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.referralCode})
                  {a.status !== "ACTIVE" ? ` - ${a.status}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Find customer by
            <select
              name="lookupType"
              value={lookupType}
              onChange={(e) => setLookupType(e.target.value)}
              style={styles.input}
            >
              <option value="phone">Phone number</option>
              <option value="email">Email</option>
              <option value="id">Shopify customer ID</option>
            </select>
          </label>

          <label style={styles.label}>
            {lookupType === "phone"
              ? "Phone number"
              : lookupType === "email"
              ? "Email"
              : "Customer ID"}
            <input
              name="lookupValue"
              required
              placeholder={placeholders[lookupType]}
              style={styles.input}
              type={lookupType === "email" ? "email" : "text"}
            />
          </label>

          <label style={styles.label}>
            Joined on
            <input
              name="joinedAt"
              type="date"
              defaultValue={today}
              max={today}
              style={styles.input}
            />
          </label>

          {error && <div style={{ ...styles.banner, ...styles.bannerError }}>{error}</div>}

          <div style={styles.modalActions}>
            <button type="button" style={styles.secondaryButton} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" style={styles.primaryButton} disabled={submitting}>
              {submitting ? "Adding…" : "Add referral"}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

/* -------------------------------- */
/* STAT CARD */
/* -------------------------------- */

function StatCard({ icon, label, value }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>{icon}</div>
      <div>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value}</div>
      </div>
    </div>
  );
}

/* -------------------------------- */
/* STYLES */
/* -------------------------------- */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7faf8",
    padding: "32px",
    color: "#17221b",
  },

  header: {
    marginBottom: "24px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
  },

  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: "700",
    letterSpacing: "-0.5px",
  },

  subtitle: {
    margin: "7px 0 0",
    color: "#718078",
    fontSize: "15px",
  },

  primaryButton: {
    height: "38px",
    padding: "0 16px",
    border: "none",
    borderRadius: "9px",
    background: "#08783d",
    color: "#ffffff",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  secondaryButton: {
    height: "38px",
    padding: "0 16px",
    border: "1px solid #dce4df",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#37423b",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
  },

  deleteButton: {
    height: "30px",
    padding: "0 12px",
    border: "1px solid #f1c9c9",
    borderRadius: "8px",
    background: "#fff5f5",
    color: "#b42318",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
  },

  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    borderRadius: "10px",
    fontSize: "13px",
    marginBottom: "20px",
  },

  bannerSuccess: {
    background: "#e5f7eb",
    color: "#16803c",
    border: "1px solid #c3e8d0",
  },

  bannerError: {
    background: "#fff5f5",
    color: "#b42318",
    border: "1px solid #f1c9c9",
  },

  bannerClose: {
    border: "none",
    background: "transparent",
    fontSize: "20px",
    lineHeight: 1,
    cursor: "pointer",
    color: "inherit",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(23, 34, 27, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 1000,
  },

  modal: {
    width: "100%",
    maxWidth: "460px",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 20px 50px rgba(0, 0, 0, 0.18)",
  },

  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    marginTop: "18px",
  },

  label: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#4b5750",
  },

  input: {
    height: "38px",
    border: "1px solid #dce4df",
    borderRadius: "9px",
    padding: "0 12px",
    background: "#fff",
    fontSize: "13px",
    fontWeight: "400",
    color: "#17221b",
    boxSizing: "border-box",
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "6px",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },

  statCard: {
    background: "#ffffff",
    border: "1px solid #e4ebe6",
    borderRadius: "14px",
    padding: "20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },

  statIcon: {
    width: "46px",
    height: "46px",
    borderRadius: "12px",
    background: "#e8f6ed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
  },

  statLabel: {
    color: "#718078",
    fontSize: "13px",
    marginBottom: "5px",
  },

  statValue: {
    fontSize: "21px",
    fontWeight: "700",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e4ebe6",
    borderRadius: "16px",
    overflow: "hidden",
  },

  toolbar: {
    padding: "22px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    borderBottom: "1px solid #edf1ee",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "19px",
    fontWeight: "700",
  },

  sectionSubtitle: {
    margin: "5px 0 0",
    color: "#7a867f",
    fontSize: "13px",
  },

  filters: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  searchWrapper: {
    position: "relative",
  },

  searchIcon: {
    position: "absolute",
    left: "12px",
    top: "9px",
    color: "#8a958e",
    fontSize: "18px",
  },

  search: {
    width: "220px",
    height: "38px",
    border: "1px solid #dce4df",
    borderRadius: "9px",
    padding: "0 12px 0 34px",
    outline: "none",
    fontSize: "13px",
    boxSizing: "border-box",
  },

  select: {
    height: "38px",
    border: "1px solid #dce4df",
    borderRadius: "9px",
    padding: "0 12px",
    background: "#fff",
    fontSize: "13px",
    color: "#37423b",
  },

  tableWrapper: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "1150px",
  },

  th: {
    textAlign: "left",
    padding: "14px 20px",
    background: "#fafcfb",
    borderBottom: "1px solid #e9eeeb",
    color: "#7a867f",
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.5px",
    whiteSpace: "nowrap",
  },

  tr: {
    borderBottom: "1px solid #edf1ee",
  },

  td: {
    padding: "16px 20px",
    fontSize: "13px",
    color: "#39443e",
    verticalAlign: "middle",
  },

  customerCell: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
  },

  avatar: {
    width: "38px",
    height: "38px",
    borderRadius: "50%",
    background: "#e3f4e9",
    color: "#08783d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "700",
    fontSize: "14px",
  },

  customerName: {
    fontWeight: "700",
    color: "#17221b",
    marginBottom: "3px",
  },

  customerId: {
    color: "#8a958e",
    fontSize: "11px",
  },

  ambassadorName: {
    fontWeight: "600",
    color: "#27332c",
    marginBottom: "3px",
  },

  code: {
    fontSize: "11px",
    color: "#8a958e",
  },

  status: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: "700",
  },

  activeStatus: {
    background: "#e5f7eb",
    color: "#16803c",
  },

  inactiveStatus: {
    background: "#f1f3f2",
    color: "#68736d",
  },

  statusDot: {
    fontSize: "7px",
  },

  footer: {
    padding: "16px 24px",
    color: "#7a867f",
    fontSize: "12px",
    background: "#fafcfb",
  },

  empty: {
    padding: "70px 30px",
    textAlign: "center",
  },

  emptyIcon: {
    fontSize: "40px",
    marginBottom: "12px",
  },

  emptyTitle: {
    margin: "0 0 7px",
    fontSize: "18px",
  },

  emptyText: {
    margin: 0,
    color: "#7a867f",
    fontSize: "13px",
  },
};