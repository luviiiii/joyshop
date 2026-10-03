import { useState } from "react";
import { useLoaderData, useNavigation, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/* =========================================================
   CONFIG
========================================================= */

const TDS_RATE = 2; // %

/*
 * Same slabs as the orders/paid webhook and the T&C:
 * a FLAT rate on the ambassador's whole monthly referred sales.
 */
function getSlabRate(monthlySales) {
  if (monthlySales <= 0) return 0;
  if (monthlySales <= 30000) return 7;
  if (monthlySales <= 60000) return 10;
  return 15;
}

/* =========================================================
   MONTH HELPERS (India time, IST = UTC+5:30)
========================================================= */

const IST_OFFSET_MS = 330 * 60 * 1000;

function currentIstYearMonth() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth() }; // month 0-11
}

function monthKey(year, month) {
  const d = new Date(Date.UTC(year, month, 1));
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

function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS),
  };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* =========================================================
   LOADER
========================================================= */

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const { year, month } = currentIstYearMonth();

  // Month picker: this month + the previous 11
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(year, month - i);
    return { value: key, label: monthLabel(key) };
  });

  // Default = LAST month (payouts are for a completed month)
  const url = new URL(request.url);
  const requested = url.searchParams.get("month");
  const selectedMonth = monthOptions.some((o) => o.value === requested)
    ? requested
    : monthKey(year, month - 1);

  const { start, end } = monthRange(selectedMonth);

  const [ambassadors, referrals, commissions] = await Promise.all([
    db.ambassador.findMany({
      where: { shop },
      select: { id: true, name: true, email: true, status: true, referralCode: true },
      orderBy: { name: "asc" },
    }),
    db.referral.findMany({
      where: { shop, joinedAt: { lt: end } },
      select: { ambassadorId: true, joinedAt: true },
    }),
    db.commission.findMany({
      where: {
        shop,
        status: { not: "REJECTED" },
        createdAt: { gte: start, lt: end },
      },
      select: { ambassadorId: true, orderAmount: true },
    }),
  ]);

  const rows = ambassadors.map((ambassador) => {
    const theirReferrals = referrals.filter((r) => r.ambassadorId === ambassador.id);

    const newReferrals = theirReferrals.filter(
      (r) => new Date(r.joinedAt) >= start
    ).length;

    const referredSales = round2(
      commissions
        .filter((c) => c.ambassadorId === ambassador.id)
        .reduce((sum, c) => sum + Number(c.orderAmount || 0), 0)
    );

    const slabRate = getSlabRate(referredSales);
    const rewardEarned = round2((referredSales * slabRate) / 100);
    const tds = round2((rewardEarned * TDS_RATE) / 100);
    const expectedPayout = round2(rewardEarned - tds);

    return {
      id: ambassador.id,
      name: ambassador.name,
      email: ambassador.email,
      status: ambassador.status,
      totalReferrals: theirReferrals.length,
      newReferrals,
      referredSales,
      slabRate,
      rewardEarned,
      tds,
      expectedPayout,
    };
  });

  return {
    selectedMonth,
    selectedMonthLabel: monthLabel(selectedMonth),
    monthOptions,
    rows,
  };
};

/* =========================================================
   EXPORT HELPERS (run in the browser)
========================================================= */

const HEADERS = [
  "Month",
  "Name",
  "Email ID",
  "Total Referrals",
  "New Referrals",
  "Referred Sales",
  "Total Reward Earned",
  "Less: TDS @ 2%",
  "Expected Payout",
  "Statement Sent",
];

function toSheetRow(row, monthText) {
  return [
    monthText,
    row.name || "",
    row.email || "",
    row.totalReferrals,
    row.newReferrals,
    row.referredSales.toFixed(2),
    row.rewardEarned.toFixed(2),
    row.tds.toFixed(2),
    row.expectedPayout.toFixed(2),
    "", // Statement Sent — filled in by you
  ];
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/* =========================================================
   PAGE
========================================================= */

export default function PayoutReport() {
  const { selectedMonth, selectedMonthLabel, monthOptions, rows } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();

  const [onlyWithSales, setOnlyWithSales] = useState(true);
  const [notice, setNotice] = useState(null);

  const loading = navigation.state === "loading";

  const visibleRows = onlyWithSales ? rows.filter((r) => r.referredSales > 0) : rows;

  const totals = visibleRows.reduce(
    (t, r) => ({
      sales: t.sales + r.referredSales,
      reward: t.reward + r.rewardEarned,
      tds: t.tds + r.tds,
      payout: t.payout + r.expectedPayout,
    }),
    { sales: 0, reward: 0, tds: 0, payout: 0 }
  );

  function changeMonth(value) {
    const next = new URLSearchParams(searchParams);
    next.set("month", value);
    setSearchParams(next);
    setNotice(null);
  }

  function downloadCsv() {
    const lines = [
      HEADERS,
      ...visibleRows.map((r) => toSheetRow(r, selectedMonthLabel)),
    ].map((cells) => cells.map(csvEscape).join(","));

    // BOM so Excel shows ₹ / Hindi names correctly
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `joyshop-payouts-${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);

    setNotice({ type: "success", text: `Downloaded ${visibleRows.length} row(s) for ${selectedMonthLabel}.` });
  }

  async function copyForSheets() {
    // Rows only (no header) — paste into cell A2 of your sheet
    const text = visibleRows
      .map((r) => toSheetRow(r, selectedMonthLabel).join("\t"))
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setNotice({
        type: "success",
        text: `Copied ${visibleRows.length} row(s). Click cell A2 in your Google Sheet and press Ctrl+V.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: "Your browser blocked copying here. Use Download CSV instead.",
      });
    }
  }

  const money = (n) =>
    `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Payout Report</h1>
          <p style={styles.subtitle}>
            Monthly ambassador rewards, ready for your payout sheet.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <label style={styles.label}>
          Month
          <select
            value={selectedMonth}
            onChange={(e) => changeMonth(e.target.value)}
            style={styles.select}
            disabled={loading}
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={onlyWithSales}
            onChange={(e) => setOnlyWithSales(e.target.checked)}
          />
          Only ambassadors with sales this month
        </label>

        <div style={styles.buttons}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={copyForSheets}
            disabled={loading || visibleRows.length === 0}
          >
            Copy for Google Sheets
          </button>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={downloadCsv}
            disabled={loading || visibleRows.length === 0}
          >
            ⬇ Download CSV
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            ...styles.notice,
            ...(notice.type === "success" ? styles.noticeSuccess : styles.noticeError),
          }}
        >
          {notice.text}
        </div>
      )}

      {/* Summary */}
      <div style={styles.statsGrid}>
        <Stat label="Ambassadors" value={visibleRows.length} />
        <Stat label="Referred Sales" value={money(totals.sales)} />
        <Stat label="Total Reward" value={money(totals.reward)} />
        <Stat label="TDS @ 2%" value={money(totals.tds)} />
        <Stat label="Total Payout" value={money(totals.payout)} highlight />
      </div>

      {/* Preview table */}
      <div style={styles.card}>
        {visibleRows.length === 0 ? (
          <div style={styles.empty}>
            <strong>No ambassador sales in {selectedMonthLabel}</strong>
            <p style={{ margin: "6px 0 0" }}>
              Untick &ldquo;Only ambassadors with sales&rdquo; to see everyone.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto", opacity: loading ? 0.5 : 1 }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  {HEADERS.map((h) => (
                    <th key={h} style={styles.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} style={styles.tr}>
                    <td style={styles.td}>{selectedMonthLabel}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{r.name}</td>
                    <td style={styles.td}>{r.email || "-"}</td>
                    <td style={styles.tdNum}>{r.totalReferrals}</td>
                    <td style={styles.tdNum}>{r.newReferrals}</td>
                    <td style={styles.tdNum}>{money(r.referredSales)}</td>
                    <td style={styles.tdNum}>
                      {money(r.rewardEarned)}
                      {r.slabRate > 0 && <span style={styles.slab}>{r.slabRate}%</span>}
                    </td>
                    <td style={styles.tdNum}>{money(r.tds)}</td>
                    <td style={{ ...styles.tdNum, fontWeight: 700 }}>{money(r.expectedPayout)}</td>
                    <td style={styles.td}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={styles.footnote}>
        Referred Sales = amount paid on referred customers&rsquo; orders in the month (cancelled
        orders excluded). Reward = slab rate on the month&rsquo;s total (up to ₹30,000 → 7%,
        ₹30,001–₹60,000 → 10%, above → 15%). Months follow India time.
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div style={{ ...styles.stat, ...(highlight ? styles.statHighlight : {}) }}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

/* =========================================================
   STYLES (matches the Referrals page)
========================================================= */

const styles = {
  page: { minHeight: "100vh", background: "#f7faf8", padding: "32px", color: "#17221b" },
  header: { marginBottom: "20px" },
  title: { margin: 0, fontSize: "30px", fontWeight: 700, letterSpacing: "-0.5px" },
  subtitle: { margin: "7px 0 0", color: "#718078", fontSize: "15px" },

  controls: {
    display: "flex",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "16px",
    background: "#fff",
    border: "1px solid #e4ebe6",
    borderRadius: "14px",
    padding: "18px 20px",
    marginBottom: "16px",
  },
  label: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#4b5750" },
  select: {
    height: "38px",
    minWidth: "200px",
    border: "1px solid #dce4df",
    borderRadius: "9px",
    padding: "0 12px",
    background: "#fff",
    fontSize: "13px",
  },
  checkbox: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#37423b", height: "38px" },
  buttons: { display: "flex", gap: "10px", marginLeft: "auto" },
  primaryButton: {
    height: "38px",
    padding: "0 18px",
    border: "none",
    borderRadius: "9px",
    background: "#08783d",
    color: "#fff",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryButton: {
    height: "38px",
    padding: "0 16px",
    border: "1px solid #dce4df",
    borderRadius: "9px",
    background: "#fff",
    color: "#37423b",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },

  notice: { padding: "12px 16px", borderRadius: "10px", fontSize: "13px", marginBottom: "16px" },
  noticeSuccess: { background: "#e5f7eb", color: "#16803c", border: "1px solid #c3e8d0" },
  noticeError: { background: "#fff5f5", color: "#b42318", border: "1px solid #f1c9c9" },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "12px", marginBottom: "16px" },
  stat: { background: "#fff", border: "1px solid #e4ebe6", borderRadius: "12px", padding: "16px" },
  statHighlight: { background: "#e8f6ed", borderColor: "#c3e8d0" },
  statLabel: { color: "#718078", fontSize: "12px", marginBottom: "5px" },
  statValue: { fontSize: "19px", fontWeight: 700 },

  card: { background: "#fff", border: "1px solid #e4ebe6", borderRadius: "16px", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "1100px" },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    background: "#fafcfb",
    borderBottom: "1px solid #e9eeeb",
    color: "#7a867f",
    fontSize: "11px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: "1px solid #edf1ee" },
  td: { padding: "13px 16px", fontSize: "13px", color: "#39443e", whiteSpace: "nowrap" },
  tdNum: { padding: "13px 16px", fontSize: "13px", color: "#39443e", whiteSpace: "nowrap", textAlign: "right" },
  slab: {
    marginLeft: "6px",
    padding: "2px 6px",
    borderRadius: "999px",
    background: "#e5f7eb",
    color: "#16803c",
    fontSize: "10px",
    fontWeight: 700,
  },
  empty: { padding: "50px 20px", textAlign: "center", color: "#7a867f", fontSize: "13px" },
  footnote: { marginTop: "14px", color: "#8a958e", fontSize: "12px", lineHeight: 1.5 },
};
