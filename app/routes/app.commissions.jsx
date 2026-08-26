import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const commissions = await db.commission.findMany({
    where: {
      shop: session.shop,
    },
    include: {
      ambassador: true,
      referral: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return Response.json({ commissions });
};


/* -------------------------------- */
/* APPROVE COMMISSION */
/* -------------------------------- */

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const actionType = formData.get("action");
  const commissionId = formData.get("commissionId");

  if (!commissionId) {
    return Response.json(
      {
        success: false,
        error: "Commission ID is required.",
      },
      { status: 400 }
    );
  }

  /* APPROVE */

  if (actionType === "approve") {
    const commission = await db.commission.findFirst({
      where: {
        id: commissionId,
        shop: session.shop,
      },
    });

    if (!commission) {
      return Response.json(
        {
          success: false,
          error: "Commission not found.",
        },
        { status: 404 }
      );
    }

    if (commission.status !== "PENDING") {
      return Response.json(
        {
          success: false,
          error: "Only pending commissions can be approved.",
        },
        { status: 400 }
      );
    }

    await db.commission.update({
      where: {
        id: commission.id,
      },
      data: {
        status: "APPROVED",
      },
    });

    return Response.json({
      success: true,
      message: "Commission approved successfully.",
    });
  }


  /* MARK AS PAID */

  if (actionType === "paid") {
    const commission = await db.commission.findFirst({
      where: {
        id: commissionId,
        shop: session.shop,
      },
    });

    if (!commission) {
      return Response.json(
        {
          success: false,
          error: "Commission not found.",
        },
        { status: 404 }
      );
    }

    if (commission.status !== "APPROVED") {
      return Response.json(
        {
          success: false,
          error: "Only approved commissions can be marked as paid.",
        },
        { status: 400 }
      );
    }

    await db.commission.update({
      where: {
        id: commission.id,
      },
      data: {
        status: "PAID",
      },
    });

    return Response.json({
      success: true,
      message: "Commission marked as paid.",
    });
  }


  return Response.json(
    {
      success: false,
      error: "Invalid action.",
    },
    { status: 400 }
  );
};


/* -------------------------------- */
/* PAGE */
/* -------------------------------- */

export default function Commissions() {
  const { commissions = [] } = useLoaderData();
  const fetcher = useFetcher();

  const isSubmitting = fetcher.state !== "idle";

  const totalCommission = commissions.reduce(
    (sum, item) =>
      sum + Number(item.commissionAmount || 0),
    0
  );

  const pendingCommission = commissions
    .filter((item) => item.status === "PENDING")
    .reduce(
      (sum, item) =>
        sum + Number(item.commissionAmount || 0),
      0
    );

  const approvedCommission = commissions
    .filter((item) => item.status === "APPROVED")
    .reduce(
      (sum, item) =>
        sum + Number(item.commissionAmount || 0),
      0
    );

  const paidCommission = commissions
    .filter((item) => item.status === "PAID")
    .reduce(
      (sum, item) =>
        sum + Number(item.commissionAmount || 0),
      0
    );

  const totalSales = commissions.reduce(
    (sum, item) =>
      sum + Number(item.orderAmount || 0),
    0
  );

  return (
    <div style={styles.page}>

      {/* HEADER */}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            Orders & Commissions
          </h1>

          <p style={styles.subtitle}>
            Track your referred orders and earnings.
          </p>
        </div>
      </div>


      {/* STATS */}

      <div style={styles.statsGrid}>

        <StatCard
          icon="🛒"
          label="Total Orders"
          value={commissions.length}
        />

        <StatCard
          icon="₹"
          label="Total Sales"
          value={`₹${totalSales.toFixed(2)}`}
        />

        <StatCard
          icon="💰"
          label="Total Commission"
          value={`₹${totalCommission.toFixed(2)}`}
        />

        <StatCard
          icon="⏱️"
          label="Pending"
          value={`₹${pendingCommission.toFixed(2)}`}
        />

      </div>


      {/* SECOND STATS */}

      <div style={styles.smallStatsGrid}>

        <div style={styles.smallStat}>
          <span>
            Approved Commission
          </span>

          <strong style={styles.approvedMoney}>
            ₹{approvedCommission.toFixed(2)}
          </strong>
        </div>


        <div style={styles.smallStat}>
          <span>
            Paid Commission
          </span>

          <strong style={styles.paidMoney}>
            ₹{paidCommission.toFixed(2)}
          </strong>
        </div>

      </div>


      {/* TABLE */}

      <div style={styles.card}>

        <div style={styles.cardHeader}>

          <div>
            <h2 style={styles.cardTitle}>
              Commission History
            </h2>

            <p style={styles.cardSubtitle}>
              Orders generated through your referral links.
            </p>
          </div>

        </div>


        {commissions.length === 0 ? (

          <div style={styles.empty}>

            <div style={styles.emptyIcon}>
              🛒
            </div>

            <h3 style={styles.emptyTitle}>
              No commissions yet
            </h3>

            <p style={styles.emptyText}>
              When someone purchases through your
              referral link, the order will appear here.
            </p>

          </div>

        ) : (

          <div style={styles.tableWrapper}>

            <table style={styles.table}>

              <thead>

                <tr>

                  <th style={styles.th}>
                    AMBASSADOR
                  </th>

                  <th style={styles.th}>
                    CUSTOMER
                  </th>

                  <th style={styles.th}>
                    ORDER
                  </th>

                  <th style={styles.th}>
                    ORDER AMOUNT
                  </th>

                  <th style={styles.th}>
                    RATE
                  </th>

                  <th style={styles.th}>
                    COMMISSION
                  </th>

                  <th style={styles.th}>
                    STATUS
                  </th>

                  <th style={styles.th}>
                    DATE
                  </th>

                  <th style={styles.th}>
                    ACTION
                  </th>

                </tr>

              </thead>


              <tbody>

                {commissions.map((item) => (

                  <tr
                    key={item.id}
                    style={styles.tr}
                  >

                    {/* AMBASSADOR */}

                    <td style={styles.td}>

                      <div style={styles.name}>
                        {item.ambassador?.name || "-"}
                      </div>

                      <div style={styles.muted}>
                        {item.ambassador?.referralCode || "-"}
                      </div>

                    </td>


                    {/* CUSTOMER */}

                    <td style={styles.td}>

                      <div style={styles.name}>
                        {item.referral?.referredName ||
                          "Customer"}
                      </div>

                      <div style={styles.muted}>
                        {item.referral?.referredEmail ||
                          item.referral?.referredCustomerId ||
                          "-"}
                      </div>

                    </td>


                    {/* ORDER */}

                    <td style={styles.td}>
                      <strong>
                        {item.orderId || "-"}
                      </strong>
                    </td>


                    {/* ORDER AMOUNT */}

                    <td style={styles.td}>
                      ₹
                      {Number(
                        item.orderAmount || 0
                      ).toFixed(2)}
                    </td>


                    {/* RATE */}

                    <td style={styles.td}>
                      {item.commissionRate != null
                        ? `${item.commissionRate}%`
                        : "-"}
                    </td>


                    {/* COMMISSION */}

                    <td style={styles.td}>

                      <strong style={styles.money}>
                        ₹
                        {Number(
                          item.commissionAmount || 0
                        ).toFixed(2)}
                      </strong>

                    </td>


                    {/* STATUS */}

                    <td style={styles.td}>

                      <StatusBadge
                        status={item.status}
                      />

                    </td>


                    {/* DATE */}

                    <td style={styles.td}>

                      {item.createdAt
                        ? new Date(
                            item.createdAt
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


                    {/* ACTION */}

                    <td style={styles.td}>

                      {item.status === "PENDING" && (

                        <fetcher.Form method="post">

                          <input
                            type="hidden"
                            name="commissionId"
                            value={item.id}
                          />

                          <input
                            type="hidden"
                            name="action"
                            value="approve"
                          />

                          <button
                            type="submit"
                            disabled={isSubmitting}
                            style={
                              isSubmitting
                                ? styles.buttonDisabled
                                : styles.approveButton
                            }
                          >
                            {isSubmitting
                              ? "Approving..."
                              : "Approve"}
                          </button>

                        </fetcher.Form>

                      )}


                      {item.status === "APPROVED" && (

                        <fetcher.Form method="post">

                          <input
                            type="hidden"
                            name="commissionId"
                            value={item.id}
                          />

                          <input
                            type="hidden"
                            name="action"
                            value="paid"
                          />

                          <button
                            type="submit"
                            disabled={isSubmitting}
                            style={
                              isSubmitting
                                ? styles.buttonDisabled
                                : styles.paidButton
                            }
                          >
                            {isSubmitting
                              ? "Processing..."
                              : "Mark Paid"}
                          </button>

                        </fetcher.Form>

                      )}


                      {item.status === "PAID" && (

                        <span style={styles.completed}>
                          Completed
                        </span>

                      )}

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}


        {commissions.length > 0 && (

          <div style={styles.footer}>
            Total orders:{" "}
            <strong>
              {commissions.length}
            </strong>
          </div>

        )}

      </div>

    </div>
  );
}


/* -------------------------------- */
/* STAT CARD */
/* -------------------------------- */

function StatCard({
  icon,
  label,
  value,
}) {
  return (
    <div style={styles.statCard}>

      <div style={styles.statIcon}>
        {icon}
      </div>

      <div>

        <div style={styles.statLabel}>
          {label}
        </div>

        <div style={styles.statValue}>
          {value}
        </div>

      </div>

    </div>
  );
}


/* -------------------------------- */
/* STATUS BADGE */
/* -------------------------------- */

function StatusBadge({ status }) {

  let badgeStyle = styles.pending;

  if (status === "APPROVED") {
    badgeStyle = styles.approved;
  }

  if (status === "PAID") {
    badgeStyle = styles.paid;
  }

  return (
    <span
      style={{
        ...styles.status,
        ...badgeStyle,
      }}
    >

      <span style={styles.statusDot}>
        ●
      </span>

      {status || "PENDING"}

    </span>
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
    marginBottom: "16px",
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
    fontSize: "19px",
    fontWeight: "700",
    color: "#08783d",
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

  smallStatsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(2, minmax(0, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },

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

  approvedMoney: {
    color: "#08783d",
    fontSize: "16px",
  },

  paidMoney: {
    color: "#2864c7",
    fontSize: "16px",
  },

  card: {
    background: "#ffffff",
    border: "1px solid #e4ebe6",
    borderRadius: "16px",
    overflow: "hidden",
  },

  cardHeader: {
    padding: "22px 24px",
    borderBottom: "1px solid #edf1ee",
  },

  cardTitle: {
    margin: 0,
    fontSize: "19px",
    fontWeight: "700",
  },

  cardSubtitle: {
    margin: "5px 0 0",
    color: "#7a867f",
    fontSize: "13px",
  },

  tableWrapper: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "1200px",
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

  name: {
    fontWeight: "600",
    color: "#27332c",
    marginBottom: "3px",
  },

  muted: {
    fontSize: "11px",
    color: "#8a958e",
  },

  money: {
    color: "#08783d",
  },

  status: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: "700",
  },

  statusDot: {
    fontSize: "7px",
  },

  pending: {
    background: "#fff4e5",
    color: "#c76b00",
  },

  approved: {
    background: "#e7f7ec",
    color: "#16803c",
  },

  paid: {
    background: "#e7f0ff",
    color: "#2864c7",
  },

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

  completed: {
    color: "#16803c",
    fontSize: "12px",
    fontWeight: "700",
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

  footer: {
    padding: "16px 24px",
    color: "#7a867f",
    fontSize: "12px",
    background: "#fafcfb",
  },
};