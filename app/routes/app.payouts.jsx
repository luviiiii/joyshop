import { authenticate } from "../shopify.server";
import db from "../db.server";
import { Form, useLoaderData, useNavigation } from "react-router";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  const payouts = await db.payout.findMany({
    where: {
      shop,
    },
    include: {
      ambassador: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const totalRequested = payouts.reduce(
    (total, payout) => total + payout.amount,
    0
  );

  const pending = payouts
    .filter((payout) => payout.status === "PENDING")
    .reduce((total, payout) => total + payout.amount, 0);

  const approved = payouts
    .filter((payout) => payout.status === "APPROVED")
    .reduce((total, payout) => total + payout.amount, 0);

  const paid = payouts
    .filter((payout) => payout.status === "PAID")
    .reduce((total, payout) => total + payout.amount, 0);

  return {
    payouts,
    totals: {
      totalRequested,
      pending,
      approved,
      paid,
    },
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  const formData = await request.formData();

  const actionType = formData.get("action");
  const payoutId = formData.get("payoutId");

  if (!payoutId) {
    return {
      success: false,
      error: "Payout ID is missing.",
    };
  }

  const payout = await db.payout.findFirst({
    where: {
      id: payoutId,
      shop,
    },
  });

  if (!payout) {
    return {
      success: false,
      error: "Payout not found.",
    };
  }

  // ------------------------------------------
  // APPROVE PAYOUT
  // ------------------------------------------

  if (actionType === "approve") {
    if (payout.status !== "PENDING") {
      return {
        success: false,
        error: "Only pending payouts can be approved.",
      };
    }

    await db.payout.update({
      where: {
        id: payout.id,
      },
      data: {
        status: "APPROVED",
      },
    });

    return {
      success: true,
      message: "Payout approved successfully.",
    };
  }

  // ------------------------------------------
  // MARK AS PAID
  // ------------------------------------------

  if (actionType === "paid") {
    if (payout.status !== "APPROVED") {
      return {
        success: false,
        error: "Only approved payouts can be marked as paid.",
      };
    }

    await db.payout.update({
      where: {
        id: payout.id,
      },
      data: {
        status: "PAID",
        processedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Payout marked as paid.",
    };
  }

  // ------------------------------------------
  // CANCEL PAYOUT
  // ------------------------------------------

  if (actionType === "cancel") {
    if (payout.status === "PAID") {
      return {
        success: false,
        error: "Paid payouts cannot be cancelled.",
      };
    }

    await db.payout.update({
      where: {
        id: payout.id,
      },
      data: {
        status: "CANCELLED",
      },
    });

    return {
      success: true,
      message: "Payout cancelled.",
    };
  }

  return {
    success: false,
    error: "Invalid action.",
  };
}

export default function Payouts() {
  const data = useLoaderData();
  const navigation = useNavigation();

  const { payouts, totals } = data;

  const isSubmitting =
    navigation.state === "submitting";

  function money(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
  }

  function statusClass(status) {
    switch (status) {
      case "PAID":
        return "status paid";

      case "APPROVED":
        return "status approved";

      case "CANCELLED":
        return "status cancelled";

      default:
        return "status pending";
    }
  }

  return (
    <div className="payout-page">

      {/* ---------------------------------- */}
      {/* HEADER */}
      {/* ---------------------------------- */}

      <div className="page-header">
        <div>
          <h1>Payouts</h1>

          <p>
            Manage ambassador payout requests
            and payments.
          </p>
        </div>
      </div>

      {/* ---------------------------------- */}
      {/* SUMMARY CARDS */}
      {/* ---------------------------------- */}

      <div className="summary-grid">

        <div className="summary-card">
          <div className="card-label">
            Total Requested
          </div>

          <div className="card-value">
            {money(totals.totalRequested)}
          </div>

          <div className="card-description">
            All payout requests
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">
            Pending
          </div>

          <div className="card-value">
            {money(totals.pending)}
          </div>

          <div className="card-description">
            Waiting for approval
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">
            Approved
          </div>

          <div className="card-value">
            {money(totals.approved)}
          </div>

          <div className="card-description">
            Ready for payment
          </div>
        </div>

        <div className="summary-card">
          <div className="card-label">
            Paid
          </div>

          <div className="card-value">
            {money(totals.paid)}
          </div>

          <div className="card-description">
            Successfully paid
          </div>
        </div>

      </div>

      {/* ---------------------------------- */}
      {/* PAYOUT TABLE */}
      {/* ---------------------------------- */}

      <div className="table-card">

        <div className="table-header">
          <div>
            <h2>Payout Requests</h2>

            <p>
              Review and process ambassador
              payout requests.
            </p>
          </div>

          <div className="request-count">
            {payouts.length} request
            {payouts.length !== 1 ? "s" : ""}
          </div>
        </div>

        {payouts.length === 0 ? (

          <div className="empty-state">

            <div className="empty-icon">
              💰
            </div>

            <h3>No payout requests yet</h3>

            <p>
              When an ambassador requests a
              payout, it will appear here.
            </p>

          </div>

        ) : (

          <div className="table-wrapper">

            <table>

              <thead>
                <tr>
                  <th>AMBASSADOR</th>
                  <th>AMOUNT</th>
                  <th>METHOD</th>
                  <th>STATUS</th>
                  <th>REQUESTED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>

              <tbody>

                {payouts.map((payout) => (

                  <tr key={payout.id}>

                    {/* Ambassador */}

                    <td>
                      <div className="ambassador-cell">

                        <div className="avatar">
                          {payout.ambassador.name
                            ?.charAt(0)
                            ?.toUpperCase() || "A"}
                        </div>

                        <div>
                          <strong>
                            {payout.ambassador.name}
                          </strong>

                          <small>
                            {payout.ambassador.referralCode}
                          </small>
                        </div>

                      </div>
                    </td>

                    {/* Amount */}

                    <td>
                      <strong>
                        {money(payout.amount)}
                      </strong>
                    </td>

                    {/* Method */}

                    <td>
                      {payout.method || "—"}
                    </td>

                    {/* Status */}

                    <td>
                      <span
                        className={statusClass(
                          payout.status
                        )}
                      >
                        {payout.status}
                      </span>
                    </td>

                    {/* Date */}

                    <td>
                      {new Date(
                        payout.requestedAt ||
                          payout.createdAt
                      ).toLocaleDateString(
                        "en-IN",
                        {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        }
                      )}
                    </td>

                    {/* Actions */}

                    <td>

                      <div className="actions">

                        {payout.status ===
                          "PENDING" && (

                          <Form method="post">

                            <input
                              type="hidden"
                              name="payoutId"
                              value={payout.id}
                            />

                            <input
                              type="hidden"
                              name="action"
                              value="approve"
                            />

                            <button
                              type="submit"
                              className="approve-button"
                              disabled={
                                isSubmitting
                              }
                            >
                              Approve
                            </button>

                          </Form>

                        )}

                        {payout.status ===
                          "APPROVED" && (

                          <Form method="post">

                            <input
                              type="hidden"
                              name="payoutId"
                              value={payout.id}
                            />

                            <input
                              type="hidden"
                              name="action"
                              value="paid"
                            />

                            <button
                              type="submit"
                              className="paid-button"
                              disabled={
                                isSubmitting
                              }
                            >
                              Mark Paid
                            </button>

                          </Form>

                        )}

                        {payout.status !==
                          "PAID" &&
                          payout.status !==
                            "CANCELLED" && (

                          <Form method="post">

                            <input
                              type="hidden"
                              name="payoutId"
                              value={payout.id}
                            />

                            <input
                              type="hidden"
                              name="action"
                              value="cancel"
                            />

                            <button
                              type="submit"
                              className="cancel-button"
                              disabled={
                                isSubmitting
                              }
                            >
                              Cancel
                            </button>

                          </Form>

                        )}

                      </div>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </div>

      {/* ---------------------------------- */}
      {/* STYLES */}
      {/* ---------------------------------- */}

      <style>{`

        .payout-page {
          padding: 32px;
          background: #f6f8f7;
          min-height: 100vh;
          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .page-header h1 {
          margin: 0;
          font-size: 32px;
          font-weight: 700;
          color: #173b2a;
        }

        .page-header p {
          margin-top: 8px;
          color: #66756d;
          font-size: 15px;
        }

        .summary-grid {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .summary-card {
          background: white;
          border: 1px solid #e1e8e4;
          border-radius: 14px;
          padding: 22px;
          box-shadow:
            0 1px 2px rgba(0,0,0,0.03);
        }

        .card-label {
          color: #68776f;
          font-size: 14px;
          margin-bottom: 10px;
        }

        .card-value {
          font-size: 27px;
          font-weight: 700;
          color: #173b2a;
        }

        .card-description {
          margin-top: 7px;
          font-size: 13px;
          color: #8a958f;
        }

        .table-card {
          background: white;
          border: 1px solid #e1e8e4;
          border-radius: 14px;
          overflow: hidden;
          box-shadow:
            0 1px 2px rgba(0,0,0,0.03);
        }

        .table-header {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #edf1ef;
        }

        .table-header h2 {
          margin: 0;
          font-size: 20px;
          color: #173b2a;
        }

        .table-header p {
          margin: 6px 0 0;
          color: #7b8781;
          font-size: 14px;
        }

        .request-count {
          background: #edf8f1;
          color: #08783f;
          padding: 8px 13px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th {
          text-align: left;
          padding: 15px 20px;
          background: #fafcfb;
          color: #69766f;
          font-size: 12px;
          letter-spacing: .03em;
          border-bottom: 1px solid #edf1ef;
        }

        td {
          padding: 18px 20px;
          border-bottom: 1px solid #edf1ef;
          color: #26352d;
          font-size: 14px;
        }

        tbody tr:last-child td {
          border-bottom: none;
        }

        .ambassador-cell {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          background: #dff3e7;
          color: #08783f;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }

        .ambassador-cell strong {
          display: block;
          color: #173b2a;
        }

        .ambassador-cell small {
          display: block;
          margin-top: 3px;
          color: #8a958f;
          font-size: 12px;
        }

        .status {
          display: inline-flex;
          padding: 6px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
        }

        .status.pending {
          background: #fff4df;
          color: #a76300;
        }

        .status.approved {
          background: #eaf4ff;
          color: #1769aa;
        }

        .status.paid {
          background: #e5f7eb;
          color: #08783f;
        }

        .status.cancelled {
          background: #f3f3f3;
          color: #777;
        }

        .actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .actions form {
          margin: 0;
        }

        .actions button {
          border: none;
          border-radius: 7px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .actions button:disabled {
          opacity: .5;
          cursor: not-allowed;
        }

        .approve-button {
          background: #08783f;
          color: white;
        }

        .paid-button {
          background: #1769aa;
          color: white;
        }

        .cancel-button {
          background: #f1f1f1;
          color: #555;
        }

        .empty-state {
          padding: 70px 20px;
          text-align: center;
        }

        .empty-icon {
          font-size: 42px;
          margin-bottom: 12px;
        }

        .empty-state h3 {
          margin: 0;
          color: #173b2a;
        }

        .empty-state p {
          margin-top: 8px;
          color: #7b8781;
        }

        @media (max-width: 900px) {

          .summary-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .payout-page {
            padding: 20px;
          }

        }

        @media (max-width: 600px) {

          .summary-grid {
            grid-template-columns: 1fr;
          }

          .table-header {
            align-items: flex-start;
            gap: 15px;
            flex-direction: column;
          }

        }

      `}</style>

    </div>
  );
}