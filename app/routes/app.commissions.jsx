import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/* -------------------------------- */
/* SHARED HELPERS (same as webhook) */
/* -------------------------------- */

function getSlabRate(monthlyTotal) {
  if (monthlyTotal <= 30000) return 7;
  if (monthlyTotal <= 60000) return 10;
  return 15;
}

const IST_OFFSET_MS = 330 * 60 * 1000;

function istMonthRange(date) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();

  return {
    start: new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - IST_OFFSET_MS),
  };
}

function toIstDateInput(value) {
  if (!value) return "";
  return new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/* -------------------------------- */
/* LOADER */
/* -------------------------------- */

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const [commissions, referrals] = await Promise.all([
    db.commission.findMany({
      where: { shop: session.shop },
      include: { ambassador: true, referral: true },
      orderBy: { createdAt: "desc" },
    }),
    db.referral.findMany({
      where: { shop: session.shop },
      select: {
        id: true,
        referredName: true,
        referredPhone: true,
        referredEmail: true,
        referredCustomerId: true,
        ambassador: { select: { name: true, referralCode: true } },
      },
      orderBy: { referredName: "asc" },
    }),
  ]);

  return Response.json({ commissions, referrals });
};

/* -------------------------------- */
/* ACTIONS */
/* -------------------------------- */

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const actionType = formData.get("action");

  /* ---------- LOOK UP A SHOPIFY ORDER ---------- */

  if (actionType === "lookup") {
    const raw = String(formData.get("orderNumber") || "").trim().replace(/^#/, "");

    if (!raw) {
      return Response.json({ intent: "lookup", success: false, error: "Enter an order number." });
    }

    try {
      const response = await admin.graphql(
        `#graphql
        query FindOrder($query: String!) {
          orders(first: 1, query: $query) {
            nodes {
              id
              name
              processedAt
              cancelledAt
              displayFinancialStatus
              currentTotalPriceSet { shopMoney { amount } }
              customer { id firstName lastName phone email }
            }
          }
        }`,
        { variables: { query: `name:"#${raw}"` } }
      );

      const json = await response.json();
      const order = json?.data?.orders?.nodes?.[0];

      if (!order) {
        return Response.json({
          intent: "lookup",
          success: false,
          error: `Order #${raw} not found. Orders older than 60 days may need extra permission — you can still fill the fields in manually.`,
        });
      }

      const orderId = order.id.split("/").pop();
      const customerId = order.customer?.id?.split("/").pop() || null;

      const referral = customerId
        ? await db.referral.findFirst({
            where: { shop, referredCustomerId: customerId },
            include: { ambassador: true },
          })
        : null;

      const existing = await db.commission.findUnique({
        where: { shop_orderId: { shop, orderId } },
      });

      const warnings = [];
      if (existing) warnings.push("This order already has a commission.");
      if (order.cancelledAt) warnings.push("This order is cancelled.");
      if (!["PAID", "PARTIALLY_REFUNDED"].includes(order.displayFinancialStatus)) {
        warnings.push(`Payment status is ${order.displayFinancialStatus}.`);
      }
      if (!customerId) warnings.push("This order has no customer attached.");
      else if (!referral) warnings.push("This customer isn't a referral yet — add them on the Referrals page first.");

      const customerName =
        [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ") ||
        order.customer?.phone ||
        order.customer?.email ||
        "No customer";

      return Response.json({
        intent: "lookup",
        success: true,
        order: {
          orderId,
          name: order.name,
          amount: Number(order.currentTotalPriceSet?.shopMoney?.amount || 0),
          date: toIstDateInput(order.processedAt),
          customerName,
          referralId: referral?.id || "",
          ambassadorName: referral?.ambassador?.name || null,
        },
        warnings,
      });
    } catch (error) {
      console.error("ORDER LOOKUP ERROR:", error);
      return Response.json({ intent: "lookup", success: false, error: "Could not search Shopify orders." });
    }
  }

  /* ---------- ADD A MISSED COMMISSION ---------- */

  if (actionType === "add") {
    const referralId = String(formData.get("referralId") || "");
    const orderId = String(formData.get("orderId") || "").trim().replace(/^#/, "");
    const orderAmount = Number(formData.get("orderAmount"));
    const orderDate = String(formData.get("orderDate") || "");

    if (!referralId) {
      return Response.json({ intent: "add", success: false, error: "Choose the referred customer." });
    }
    if (!orderId) {
      return Response.json({ intent: "add", success: false, error: "Enter the order ID." });
    }
    if (!Number.isFinite(orderAmount) || orderAmount <= 0) {
      return Response.json({ intent: "add", success: false, error: "Enter a valid order amount." });
    }

    const createdAt = new Date(`${orderDate}T12:00:00+05:30`);

    if (!orderDate || Number.isNaN(createdAt.getTime()) || createdAt.getTime() > Date.now() + 86400000) {
      return Response.json({ intent: "add", success: false, error: "Enter a valid order date (not in the future)." });
    }

    const referral = await db.referral.findFirst({
      where: { id: referralId, shop },
      include: { ambassador: true },
    });

    if (!referral) {
      return Response.json({ intent: "add", success: false, error: "Referral not found." });
    }

    const existing = await db.commission.findUnique({
      where: { shop_orderId: { shop, orderId } },
    });

    if (existing) {
      return Response.json({
        intent: "add",
        success: false,
        error: `Order ${orderId} already has a commission (${existing.status}).`,
      });
    }

    /*
     * Exactly what the orders/paid webhook does, in one transaction:
     * create the commission, then re-apply the slab to every PENDING
     * commission in THAT order's month (India time), and update the
     * ambassador's totals.
     */
    const { start, end } = istMonthRange(createdAt);
    const ambassadorId = referral.ambassadorId;

    try {
      const result = await db.$transaction(
        async (tx) => {
          const commission = await tx.commission.create({
            data: {
              shop,
              ambassadorId,
              referralId: referral.id,
              customerId: referral.referredCustomerId,
              orderId,
              orderAmount,
              commissionRate: 0,
              commissionAmount: 0,
              status: "PENDING",
              createdAt,
            },
          });

          const monthly = await tx.commission.findMany({
            where: {
              shop,
              ambassadorId,
              status: { not: "REJECTED" },
              createdAt: { gte: start, lt: end },
            },
          });

          const monthlyTotal = monthly.reduce((sum, c) => sum + Number(c.orderAmount || 0), 0);
          const rate = getSlabRate(monthlyTotal);

          let otherDelta = 0;

          for (const item of monthly) {
            if (item.status !== "PENDING") continue;

            const amount = (Number(item.orderAmount || 0) * rate) / 100;

            await tx.commission.update({
              where: { id: item.id },
              data: { commissionRate: rate, commissionAmount: amount },
            });

            if (item.id !== commission.id) {
              otherDelta += amount - Number(item.commissionAmount || 0);
            }
          }

          const thisAmount = (orderAmount * rate) / 100;

          await tx.ambassador.update({
            where: { id: ambassadorId },
            data: {
              totalOrders: { increment: 1 },
              totalEarnings: { increment: thisAmount + otherDelta },
            },
          });

          return { rate, thisAmount, monthlyTotal };
        },
        { timeout: 20000 }
      );

      return Response.json({
        intent: "add",
        success: true,
        message: `Commission added for ${referral.ambassador?.name}: ₹${result.thisAmount.toFixed(2)} at ${result.rate}% (month total ₹${result.monthlyTotal.toFixed(2)}).`,
      });
    } catch (error) {
      if (error?.code === "P2002") {
        return Response.json({ intent: "add", success: false, error: "This order already has a commission." });
      }
      console.error("ADD COMMISSION ERROR:", error);
      return Response.json({ intent: "add", success: false, error: "Could not add the commission." });
    }
  }

  /* ---------- ROW ACTIONS (approve / reject / edit / paid) ---------- */

  const commissionId = formData.get("commissionId");

  if (!commissionId) {
    return Response.json({ success: false, error: "Commission ID is required." }, { status: 400 });
  }

  const commission = await db.commission.findFirst({
    where: { id: commissionId, shop },
  });

  if (!commission) {
    return Response.json({ success: false, error: "Commission not found." }, { status: 404 });
  }

  if (actionType === "approve") {
    if (commission.status !== "PENDING") {
      return Response.json({ success: false, error: "Only pending commissions can be approved." }, { status: 400 });
    }

    await db.commission.update({ where: { id: commission.id }, data: { status: "APPROVED" } });
    return Response.json({ success: true, message: "Commission approved successfully." });
  }

  if (actionType === "reject") {
    if (commission.status === "PAID") {
      return Response.json({ success: false, error: "Paid commissions cannot be rejected." }, { status: 400 });
    }
    if (commission.status === "REJECTED") {
      return Response.json({ success: false, error: "This commission is already rejected." }, { status: 400 });
    }

    await db.commission.update({ where: { id: commission.id }, data: { status: "REJECTED" } });
    return Response.json({ success: true, message: "Commission rejected." });
  }

  if (actionType === "edit") {
    if (commission.status === "PAID") {
      return Response.json({ success: false, error: "Paid commissions cannot be edited." }, { status: 400 });
    }

    const newRateRaw = formData.get("commissionRate");
    const newRate = Number(newRateRaw);

    if (newRateRaw === null || newRateRaw === "" || Number.isNaN(newRate) || newRate < 0 || newRate > 100) {
      return Response.json({ success: false, error: "Enter a valid commission rate (0-100)." }, { status: 400 });
    }

    const recalculatedAmount = (Number(commission.orderAmount || 0) * newRate) / 100;

    await db.commission.update({
      where: { id: commission.id },
      data: { commissionRate: newRate, commissionAmount: recalculatedAmount },
    });

    return Response.json({ success: true, message: "Commission rate updated." });
  }

  if (actionType === "paid") {
    if (commission.status !== "APPROVED") {
      return Response.json({ success: false, error: "Only approved commissions can be marked as paid." }, { status: 400 });
    }

    await db.commission.update({ where: { id: commission.id }, data: { status: "PAID" } });
    return Response.json({ success: true, message: "Commission marked as paid." });
  }

  return Response.json({ success: false, error: "Invalid action." }, { status: 400 });
};

/* -------------------------------- */
/* PAGE */
/* -------------------------------- */

export default function Commissions() {
  const { commissions = [], referrals = [] } = useLoaderData();
  const fetcher = useFetcher();
  const addFetcher = useFetcher();

  const isSubmitting = fetcher.state !== "idle";

  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [expandedAmbassadors, setExpandedAmbassadors] = useState(new Set());
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [banner, setBanner] = useState(null);

  // Banner for approve / reject / edit / paid results
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      setBanner(
        fetcher.data.success
          ? { type: "success", text: fetcher.data.message }
          : { type: "error", text: fetcher.data.error }
      );
    }
  }, [fetcher.state, fetcher.data]);

  // Close the modal + show banner after a successful add
  useEffect(() => {
    if (addFetcher.state === "idle" && addFetcher.data?.intent === "add" && addFetcher.data.success) {
      setShowAdd(false);
      setBanner({ type: "success", text: addFetcher.data.message });
    }
  }, [addFetcher.state, addFetcher.data]);

  function monthKey(dateValue) {
    const d = new Date(dateValue);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }

  function toggleAmbassador(key) {
    setExpandedAmbassadors((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function startEditing(item) {
    setEditingId(item.id);
    setEditValue(String(item.commissionRate ?? 0));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditValue("");
  }

  function saveEditing(commissionId) {
    fetcher.submit(
      { action: "edit", commissionId, commissionRate: editValue },
      { method: "post" }
    );
    setEditingId(null);
    setEditValue("");
  }

  const availableMonths = Array.from(
    new Set(commissions.map((item) => monthKey(item.createdAt)))
  ).sort((a, b) => (a < b ? 1 : -1));

  const filteredCommissions =
    selectedMonth === "all"
      ? commissions
      : commissions.filter((item) => monthKey(item.createdAt) === selectedMonth);

  const sumBy = (list, field) => list.reduce((sum, item) => sum + Number(item[field] || 0), 0);

  const totalCommission = sumBy(filteredCommissions.filter((i) => i.status !== "REJECTED"), "commissionAmount");
  const pendingCommission = sumBy(filteredCommissions.filter((i) => i.status === "PENDING"), "commissionAmount");
  const approvedCommission = sumBy(filteredCommissions.filter((i) => i.status === "APPROVED"), "commissionAmount");
  const paidCommission = sumBy(filteredCommissions.filter((i) => i.status === "PAID"), "commissionAmount");
  const totalSales = sumBy(filteredCommissions.filter((i) => i.status !== "REJECTED"), "orderAmount");

  const groupsMap = new Map();

  for (const item of filteredCommissions) {
    const key = item.ambassador?.id || "unknown";

    if (!groupsMap.has(key)) {
      groupsMap.set(key, { key, ambassador: item.ambassador || null, items: [] });
    }

    groupsMap.get(key).items.push(item);
  }

  const groups = Array.from(groupsMap.values());

  return (
    <div style={styles.page}>

      {/* HEADER */}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Orders & Commissions</h1>
          <p style={styles.subtitle}>Track your referred orders and earnings.</p>
        </div>

        <button
          type="button"
          style={styles.addButton}
          onClick={() => {
            setBanner(null);
            setShowAdd(true);
          }}
        >
          + Add commission
        </button>
      </div>

      {banner && (
        <div
          style={{
            ...styles.banner,
            ...(banner.type === "success" ? styles.bannerSuccess : styles.bannerError),
          }}
        >
          <span>{banner.text}</span>
          <button type="button" style={styles.bannerClose} onClick={() => setBanner(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {/* STATS */}

      <div style={styles.statsGrid}>
        <StatCard icon="🛒" label="Total Orders" value={filteredCommissions.length} />
        <StatCard icon="₹" label="Total Sales" value={`₹${totalSales.toFixed(2)}`} />
        <StatCard icon="💰" label="Total Commission" value={`₹${totalCommission.toFixed(2)}`} />
        <StatCard icon="⏱️" label="Pending" value={`₹${pendingCommission.toFixed(2)}`} />
      </div>

      <div style={styles.smallStatsGrid}>
        <div style={styles.smallStat}>
          <span>Approved Commission</span>
          <strong style={styles.approvedMoney}>₹{approvedCommission.toFixed(2)}</strong>
        </div>

        <div style={styles.smallStat}>
          <span>Paid Commission</span>
          <strong style={styles.paidMoney}>₹{paidCommission.toFixed(2)}</strong>
        </div>
      </div>

      {/* AMBASSADOR-GROUPED COMMISSION HISTORY */}

      <div style={styles.card}>
        <div style={styles.cardHeaderRow}>
          <div>
            <h2 style={styles.cardTitle}>Commission History</h2>
            <p style={styles.cardSubtitle}>
              Orders generated through your referral links, grouped by ambassador.
            </p>
          </div>

          {availableMonths.length > 0 && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={styles.monthSelect}
            >
              <option value="all">All Time</option>
              {availableMonths.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
          )}
        </div>

        {commissions.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🛒</div>
            <h3 style={styles.emptyTitle}>No commissions yet</h3>
            <p style={styles.emptyText}>
              When someone purchases through your referral link, the order will appear here.
            </p>
          </div>
        ) : filteredCommissions.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🛒</div>
            <h3 style={styles.emptyTitle}>No commissions in {monthLabel(selectedMonth)}</h3>
            <p style={styles.emptyText}>Try a different month, or select "All Time".</p>
          </div>
        ) : (
          <div>
            {groups.map((group) => {
              const isOpen = expandedAmbassadors.has(group.key);

              const groupPending = sumBy(group.items.filter((i) => i.status === "PENDING"), "commissionAmount");
              const groupApproved = sumBy(group.items.filter((i) => i.status === "APPROVED"), "commissionAmount");
              const groupPaid = sumBy(group.items.filter((i) => i.status === "PAID"), "commissionAmount");
              const groupTotal = groupPending + groupApproved + groupPaid;

              return (
                <div key={group.key} style={styles.groupWrapper}>
                  <button
                    type="button"
                    onClick={() => toggleAmbassador(group.key)}
                    style={styles.groupHeaderButton}
                  >
                    <div style={styles.groupHeaderLeft}>
                      <div style={styles.name}>{group.ambassador?.name || "Unknown Ambassador"}</div>
                      <div style={styles.muted}>
                        {group.ambassador?.referralCode || "-"} &nbsp;•&nbsp; {group.items.length} order
                        {group.items.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    <div style={styles.groupHeaderRight}>
                      <div style={styles.groupHeaderStat}>
                        <div style={styles.muted}>Pending</div>
                        <strong style={styles.pendingText}>₹{groupPending.toFixed(2)}</strong>
                      </div>
                      <div style={styles.groupHeaderStat}>
                        <div style={styles.muted}>Approved</div>
                        <strong style={styles.approvedText}>₹{groupApproved.toFixed(2)}</strong>
                      </div>
                      <div style={styles.groupHeaderStat}>
                        <div style={styles.muted}>Paid</div>
                        <strong style={styles.paidText}>₹{groupPaid.toFixed(2)}</strong>
                      </div>
                      <div style={styles.groupHeaderStat}>
                        <div style={styles.muted}>Total</div>
                        <strong style={styles.money}>₹{groupTotal.toFixed(2)}</strong>
                      </div>
                      <span aria-hidden="true" style={styles.groupArrow}>
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div style={styles.tableWrapper}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.th}>CUSTOMER</th>
                            <th style={styles.th}>ORDER</th>
                            <th style={styles.th}>ORDER AMOUNT</th>
                            <th style={styles.th}>RATE</th>
                            <th style={styles.th}>COMMISSION</th>
                            <th style={styles.th}>STATUS</th>
                            <th style={styles.th}>DATE</th>
                            <th style={styles.th}>ACTION</th>
                          </tr>
                        </thead>

                        <tbody>
                          {group.items.map((item) => {
                            const isEditingThisRow = editingId === item.id;
                            const canEditOrReject = item.status === "PENDING" || item.status === "APPROVED";

                            return (
                              <tr key={item.id} style={styles.tr}>
                                <td style={styles.td}>
                                  <div style={styles.name}>{item.referral?.referredName || "Customer"}</div>
                                  <div style={styles.muted}>
                                    {item.referral?.referredEmail || item.referral?.referredCustomerId || "-"}
                                  </div>
                                </td>

                                <td style={styles.td}>
                                  <strong>{item.orderId || "-"}</strong>
                                </td>

                                <td style={styles.td}>₹{Number(item.orderAmount || 0).toFixed(2)}</td>

                                <td style={styles.td}>
                                  {isEditingThisRow ? (
                                    <div style={styles.editRow}>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        style={styles.editInput}
                                        autoFocus
                                      />
                                      <span style={styles.muted}>%</span>
                                    </div>
                                  ) : item.commissionRate != null ? (
                                    `${item.commissionRate}%`
                                  ) : (
                                    "-"
                                  )}
                                </td>

                                <td style={styles.td}>
                                  <strong style={styles.money}>
                                    ₹
                                    {isEditingThisRow
                                      ? ((Number(item.orderAmount || 0) * Number(editValue || 0)) / 100).toFixed(2)
                                      : Number(item.commissionAmount || 0).toFixed(2)}
                                  </strong>
                                </td>

                                <td style={styles.td}>
                                  <StatusBadge status={item.status} />
                                </td>

                                <td style={styles.td}>
                                  {item.createdAt
                                    ? new Date(item.createdAt).toLocaleDateString("en-IN", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                      })
                                    : "-"}
                                </td>

                                <td style={styles.td}>
                                  {isEditingThisRow ? (
                                    <div style={styles.actionRow}>
                                      <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => saveEditing(item.id)}
                                        style={isSubmitting ? styles.buttonDisabled : styles.approveButton}
                                      >
                                        Save
                                      </button>
                                      <button type="button" onClick={cancelEditing} style={styles.cancelButton}>
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={styles.actionRow}>
                                      {item.status === "PENDING" && (
                                        <fetcher.Form method="post">
                                          <input type="hidden" name="commissionId" value={item.id} />
                                          <input type="hidden" name="action" value="approve" />
                                          <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            style={isSubmitting ? styles.buttonDisabled : styles.approveButton}
                                          >
                                            {isSubmitting ? "Approving..." : "Approve"}
                                          </button>
                                        </fetcher.Form>
                                      )}

                                      {item.status === "APPROVED" && (
                                        <fetcher.Form method="post">
                                          <input type="hidden" name="commissionId" value={item.id} />
                                          <input type="hidden" name="action" value="paid" />
                                          <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            style={isSubmitting ? styles.buttonDisabled : styles.paidButton}
                                          >
                                            {isSubmitting ? "Processing..." : "Mark Paid"}
                                          </button>
                                        </fetcher.Form>
                                      )}

                                      {canEditOrReject && (
                                        <button type="button" onClick={() => startEditing(item)} style={styles.editButton}>
                                          Edit
                                        </button>
                                      )}

                                      {canEditOrReject && (
                                        <fetcher.Form method="post">
                                          <input type="hidden" name="commissionId" value={item.id} />
                                          <input type="hidden" name="action" value="reject" />
                                          <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            style={isSubmitting ? styles.buttonDisabled : styles.rejectButton}
                                          >
                                            Reject
                                          </button>
                                        </fetcher.Form>
                                      )}

                                      {item.status === "PAID" && <span style={styles.completed}>Completed</span>}
                                      {item.status === "REJECTED" && <span style={styles.rejectedText}>Rejected</span>}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredCommissions.length > 0 && (
          <div style={styles.footer}>
            Total orders: <strong>{filteredCommissions.length}</strong> &nbsp;•&nbsp; Ambassadors:{" "}
            <strong>{groups.length}</strong>
          </div>
        )}
      </div>

      {showAdd && (
        <AddCommissionModal
          referrals={referrals}
          fetcher={addFetcher}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------- */
/* ADD COMMISSION MODAL */
/* -------------------------------- */

function AddCommissionModal({ referrals, fetcher, onClose }) {
  const [orderNumber, setOrderNumber] = useState("");
  const [referralId, setReferralId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orderAmount, setOrderAmount] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [lookup, setLookup] = useState(null);

  const busy = fetcher.state !== "idle";
  const intent = fetcher.formData?.get("action");
  const today = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

  // Fill the form from a successful order lookup
  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data?.intent !== "lookup") return;

    setLookup(fetcher.data);

    if (fetcher.data.success) {
      const o = fetcher.data.order;
      setOrderId(o.orderId);
      setOrderAmount(String(o.amount));
      setOrderDate(o.date);
      if (o.referralId) setReferralId(o.referralId);
    }
  }, [fetcher.state, fetcher.data]);

  const addError =
    fetcher.state === "idle" && fetcher.data?.intent === "add" && !fetcher.data.success
      ? fetcher.data.error
      : null;


  function runLookup() {
    fetcher.submit({ action: "lookup", orderNumber }, { method: "post" });
  }

  function submitAdd() {
    fetcher.submit(
      { action: "add", referralId, orderId, orderAmount, orderDate },
      { method: "post" }
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.cardTitle}>Add missed commission</h2>
          <button type="button" style={styles.bannerClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p style={styles.cardSubtitle}>
          Look up the Shopify order to fill everything in automatically. The commission uses the
          same slab as automatic ones (based on that month&rsquo;s total) and updates the
          ambassador&rsquo;s other pending commissions for that month.
        </p>

        {/* Step 1: lookup */}
        <label style={styles.label}>
          Shopify order number
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && orderNumber.trim()) runLookup();
              }}
              placeholder="e.g. 1234"
              style={{ ...styles.input, flex: 1 }}
            />
            <button
              type="button"
              style={styles.secondaryButton}
              onClick={runLookup}
              disabled={busy || !orderNumber.trim()}
            >
              {busy && intent === "lookup" ? "Searching…" : "Look up"}
            </button>
          </div>
        </label>

        {lookup && !lookup.success && (
          <div style={{ ...styles.banner, ...styles.bannerError }}>{lookup.error}</div>
        )}

        {lookup?.success && (
          <div style={styles.lookupBox}>
            <div>
              <strong>{lookup.order.name}</strong> · {lookup.order.customerName}
              {lookup.order.ambassadorName && <> · referred by <strong>{lookup.order.ambassadorName}</strong></>}
            </div>
            {lookup.warnings?.map((w) => (
              <div key={w} style={styles.warning}>⚠ {w}</div>
            ))}
          </div>
        )}

        <div style={styles.divider} />

        {/* Step 2: details (editable) */}
        <label style={styles.label}>
          Referred customer
          <select value={referralId} onChange={(e) => setReferralId(e.target.value)} style={styles.input}>
            <option value="">Choose customer</option>
            {referrals.map((r) => (
              <option key={r.id} value={r.id}>
                {r.referredName || r.referredPhone || r.referredEmail || r.referredCustomerId} — {r.ambassador?.name}
              </option>
            ))}
          </select>
        </label>

        <div style={styles.twoCol}>
          <label style={styles.label}>
            Order ID
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="Shopify order ID"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Order amount (₹ paid)
            <input
              type="number"
              min="0"
              step="0.01"
              value={orderAmount}
              onChange={(e) => setOrderAmount(e.target.value)}
              style={styles.input}
            />
          </label>
        </div>

        <label style={styles.label}>
          Order date (decides the month &amp; slab)
          <input
            type="date"
            value={orderDate}
            max={today}
            onChange={(e) => setOrderDate(e.target.value)}
            style={styles.input}
          />
        </label>

        {addError && <div style={{ ...styles.banner, ...styles.bannerError }}>{addError}</div>}

        <div style={styles.modalActions}>
          <button type="button" style={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={busy ? styles.buttonDisabled : styles.addButton}
            disabled={busy || !referralId || !orderId || !orderAmount || !orderDate}
            onClick={submitAdd}
          >
            {busy && intent === "add" ? "Adding…" : "Add commission"}
          </button>
        </div>
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
/* STATUS BADGE */
/* -------------------------------- */

function StatusBadge({ status }) {
  let badgeStyle = styles.pending;
  if (status === "APPROVED") badgeStyle = styles.approved;
  if (status === "PAID") badgeStyle = styles.paid;
  if (status === "REJECTED") badgeStyle = styles.rejected;

  return (
    <span style={{ ...styles.status, ...badgeStyle }}>
      <span style={styles.statusDot}>●</span>
      {status || "PENDING"}
    </span>
  );
}

/* -------------------------------- */
/* STYLES */
/* -------------------------------- */

const styles = {
  page: { minHeight: "100vh", background: "#f7faf8", padding: "32px", color: "#17221b" },

  header: {
    marginBottom: "24px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
  },
  title: { margin: 0, fontSize: "30px", fontWeight: "700", letterSpacing: "-0.5px" },
  subtitle: { margin: "7px 0 0", color: "#718078", fontSize: "15px" },

  addButton: {
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
    padding: "0 14px",
    border: "1px solid #cdd8d1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#39443e",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    borderRadius: "10px",
    fontSize: "13px",
    marginBottom: "16px",
  },
  bannerSuccess: { background: "#e5f7eb", color: "#16803c", border: "1px solid #c3e8d0" },
  bannerError: { background: "#fff5f5", color: "#b42318", border: "1px solid #f1c9c9" },
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
    maxWidth: "520px",
    maxHeight: "90vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 20px 50px rgba(0, 0, 0, 0.18)",
  },
  modalHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontSize: "12px",
    fontWeight: "700",
    color: "#4b5750",
    marginTop: "14px",
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
    width: "100%",
  },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  lookupBox: {
    marginTop: "12px",
    padding: "12px 14px",
    borderRadius: "10px",
    background: "#f4f9f5",
    fontSize: "13px",
    color: "#27332c",
  },
  warning: { marginTop: "6px", color: "#a86412", fontSize: "12px" },
  divider: { height: "1px", background: "#edf1ee", margin: "18px 0 4px" },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px", marginBottom: "16px" },
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
    fontSize: "19px",
    fontWeight: "700",
    color: "#08783d",
  },
  statLabel: { color: "#718078", fontSize: "13px", marginBottom: "5px" },
  statValue: { fontSize: "21px", fontWeight: "700" },

  smallStatsGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px", marginBottom: "24px" },
  smallStat: {
    background: "#ffffff",
    border: "1px solid #e4ebe6",
    borderRadius: "14px",
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#718078",
    fontSize: "13px",
  },
  approvedMoney: { color: "#08783d", fontSize: "16px" },
  paidMoney: { color: "#2864c7", fontSize: "16px" },

  card: { background: "#ffffff", border: "1px solid #e4ebe6", borderRadius: "16px", overflow: "hidden" },
  cardHeaderRow: {
    padding: "22px 24px",
    borderBottom: "1px solid #edf1ee",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  monthSelect: {
    height: "38px",
    border: "1px solid #dce4df",
    borderRadius: "9px",
    padding: "0 12px",
    background: "#fff",
    fontSize: "13px",
    color: "#37423b",
    flexShrink: 0,
  },
  cardTitle: { margin: 0, fontSize: "19px", fontWeight: "700" },
  cardSubtitle: { margin: "5px 0 0", color: "#7a867f", fontSize: "13px", lineHeight: 1.5 },

  groupWrapper: { borderBottom: "1px solid #edf1ee" },
  groupHeaderButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    padding: "18px 24px",
    background: "none",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  },
  groupHeaderLeft: { minWidth: 0 },
  groupHeaderRight: { display: "flex", alignItems: "center", gap: "24px", flexShrink: 0 },
  groupHeaderStat: { textAlign: "right", minWidth: "90px" },
  pendingText: { color: "#c76b00" },
  approvedText: { color: "#16803c" },
  paidText: { color: "#2864c7" },
  groupArrow: { fontSize: "16px", color: "#7a867f" },

  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: "1150px" },
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
  tr: { borderBottom: "1px solid #edf1ee" },
  td: { padding: "16px 20px", fontSize: "13px", color: "#39443e", verticalAlign: "middle" },
  name: { fontWeight: "600", color: "#27332c", marginBottom: "3px" },
  muted: { fontSize: "11px", color: "#8a958e" },
  money: { color: "#08783d" },

  status: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: "700",
  },
  statusDot: { fontSize: "7px" },
  pending: { background: "#fff4e5", color: "#c76b00" },
  approved: { background: "#e7f7ec", color: "#16803c" },
  paid: { background: "#e7f0ff", color: "#2864c7" },
  rejected: { background: "#fdeceb", color: "#b42318" },

  actionRow: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  editRow: { display: "flex", alignItems: "center" },
  editInput: { width: "100px", padding: "6px 8px", borderRadius: "6px", border: "1px solid #cdd8d1", fontSize: "13px" },

  approveButton: {
    border: "none",
    background: "#08783d",
    color: "#ffffff",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  paidButton: {
    border: "none",
    background: "#2864c7",
    color: "#ffffff",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  editButton: {
    border: "1px solid #cdd8d1",
    background: "#ffffff",
    color: "#39443e",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  rejectButton: {
    background: "#ffffff",
    color: "#b42318",
    border: "1px solid #f3c6c1",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  cancelButton: {
    border: "1px solid #cdd8d1",
    background: "#ffffff",
    color: "#39443e",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
  },
  buttonDisabled: {
    border: "none",
    background: "#aab8b0",
    color: "#ffffff",
    padding: "8px 14px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "not-allowed",
  },
  completed: { color: "#16803c", fontSize: "12px", fontWeight: "700" },
  rejectedText: { color: "#b42318", fontSize: "12px", fontWeight: "700" },

  empty: { padding: "70px 30px", textAlign: "center" },
  emptyIcon: { fontSize: "40px", marginBottom: "12px" },
  emptyTitle: { margin: "0 0 7px", fontSize: "18px" },
  emptyText: { margin: 0, color: "#7a867f", fontSize: "13px" },

  footer: { padding: "16px 24px", color: "#7a867f", fontSize: "12px", background: "#fafcfb" },
};
