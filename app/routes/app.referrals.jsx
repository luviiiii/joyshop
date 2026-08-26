import { useState } from "react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const referrals = await db.referral.findMany({
    where: {
      shop: session.shop,
    },
    include: {
      ambassador: true,
      credits: true,
      commissions: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return Response.json({ referrals });
};

export default function Referrals({ loaderData }) {
  const referrals = loaderData?.referrals || [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredReferrals = referrals.filter((referral) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      !search ||
      referral.referredName?.toLowerCase().includes(searchText) ||
      referral.referredEmail?.toLowerCase().includes(searchText) ||
      referral.referredCustomerId
        ?.toLowerCase()
        .includes(searchText) ||
      referral.ambassador?.name
        ?.toLowerCase()
        .includes(searchText);

    const matchesStatus =
      statusFilter === "ALL" ||
      referral.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalCredits = referrals.reduce(
    (total, referral) =>
      total +
      referral.credits.reduce(
        (sum, credit) => sum + Number(credit.amount || 0),
        0
      ),
    0
  );

  const totalCommission = referrals.reduce(
    (total, referral) =>
      total +
      referral.commissions.reduce(
        (sum, commission) =>
          sum + Number(commission.commissionAmount || 0),
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
      </div>

      {/* Summary cards */}
      <div style={styles.statsGrid}>
        <StatCard
          icon="👥"
          label="Total Referrals"
          value={referrals.length}
        />

        <StatCard
          icon="✓"
          label="Active Referrals"
          value={activeReferrals}
        />

        <StatCard
          icon="💰"
          label="Customer Credits"
          value={`₹${totalCredits.toFixed(2)}`}
        />

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
            <h2 style={styles.sectionTitle}>
              All Referrals
            </h2>

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
              onChange={(e) =>
                setStatusFilter(e.target.value)
              }
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
                  <th style={styles.th}>STATUS</th>
                  <th style={styles.th}>JOINED</th>
                  <th style={styles.th}>CREDITS</th>
                  <th style={styles.th}>COMMISSION</th>
                </tr>
              </thead>

              <tbody>
                {filteredReferrals.map((referral) => {
                  const credits =
                    referral.credits.reduce(
                      (sum, credit) =>
                        sum +
                        Number(credit.amount || 0),
                      0
                    );

                  const commission =
                    referral.commissions.reduce(
                      (sum, item) =>
                        sum +
                        Number(
                          item.commissionAmount || 0
                        ),
                      0
                    );

                  return (
                    <tr
                      key={referral.id}
                      style={styles.tr}
                    >
                      {/* Customer */}
                      <td style={styles.td}>
                        <div style={styles.customerCell}>
                          <div style={styles.avatar}>
                            {(
                              referral.referredName ||
                              "C"
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <div
                              style={
                                styles.customerName
                              }
                            >
                              {referral.referredName ||
                                "Customer"}
                            </div>

                            <div
                              style={
                                styles.customerId
                              }
                            >
                              {referral.referredCustomerId ||
                                "-"}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Ambassador */}
                      <td style={styles.td}>
                        <div style={styles.ambassadorName}>
                          {referral.ambassador?.name ||
                            "-"}
                        </div>

                        <div style={styles.code}>
                          {referral.ambassador
                            ?.referralCode || "-"}
                        </div>
                      </td>

                      {/* Email */}
                      <td style={styles.td}>
                        {referral.referredEmail || "-"}
                      </td>

                      {/* Status */}
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.status,
                            ...(referral.status ===
                            "ACTIVE"
                              ? styles.activeStatus
                              : styles.inactiveStatus),
                          }}
                        >
                          <span style={styles.statusDot}>
                            ●
                          </span>

                          {referral.status}
                        </span>
                      </td>

                      {/* Joined */}
                      <td style={styles.td}>
                        {referral.joinedAt
                          ? new Date(
                              referral.joinedAt
                            ).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              }
                            )
                          : "-"}
                      </td>

                      {/* Credits */}
                      <td style={styles.td}>
                        <strong>
                          ₹{credits.toFixed(2)}
                        </strong>
                      </td>

                      {/* Commission */}
                      <td style={styles.td}>
                        <strong>
                          ₹{commission.toFixed(2)}
                        </strong>
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
            Showing{" "}
            <strong>
              {filteredReferrals.length}
            </strong>{" "}
            of{" "}
            <strong>
              {referrals.length}
            </strong>{" "}
            referrals
          </div>
        )}
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

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(4, minmax(0, 1fr))",
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
    minWidth: "950px",
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