import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  const credits = await prisma.referralCredit.findMany({
    where: {
      shop,
    },
    include: {
      referral: {
        include: {
          ambassador: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const totalCredits = credits.reduce(
    (sum, credit) => sum + credit.amount,
    0
  );

  const availableCredits = credits
    .filter((credit) => credit.status === "AVAILABLE")
    .reduce((sum, credit) => sum + credit.amount, 0);

  const usedCredits = credits
    .filter((credit) => credit.status === "USED")
    .reduce((sum, credit) => sum + credit.amount, 0);

  return {
    credits,
    totalCredits,
    availableCredits,
    usedCredits,
  };
}

export default function CustomerCredits() {
  const {
    credits,
    totalCredits,
    availableCredits,
    usedCredits,
  } = useLoaderData();

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "32px",
          fontWeight: "700",
          marginBottom: "8px",
        }}
      >
        Customer Credits
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "32px",
        }}
      >
        Manage referral credits earned by customers.
      </p>

      {/* Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "20px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <div style={{ color: "#666", marginBottom: "10px" }}>
            Total Credits
          </div>

          <div
            style={{
              fontSize: "28px",
              fontWeight: "700",
            }}
          >
            ₹{totalCredits.toFixed(2)}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <div style={{ color: "#666", marginBottom: "10px" }}>
            Available Credits
          </div>

          <div
            style={{
              fontSize: "28px",
              fontWeight: "700",
              color: "#16803c",
            }}
          >
            ₹{availableCredits.toFixed(2)}
          </div>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "24px",
          }}
        >
          <div style={{ color: "#666", marginBottom: "10px" }}>
            Used Credits
          </div>

          <div
            style={{
              fontSize: "28px",
              fontWeight: "700",
            }}
          >
            ₹{usedCredits.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Credits Table */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #ddd",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
            }}
          >
            Credit History
          </h2>
        </div>

        {credits.length === 0 ? (
          <div
            style={{
              padding: "60px 20px",
              textAlign: "center",
              color: "#666",
            }}
          >
            <div
              style={{
                fontSize: "18px",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              No customer credits yet
            </div>

            <div>
              Credits will appear here when customers earn referral rewards.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f7f7f7",
                    textAlign: "left",
                  }}
                >
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Ambassador</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Order</th>
                  <th style={thStyle}>Created</th>
                </tr>
              </thead>

              <tbody>
                {credits.map((credit) => (
                  <tr key={credit.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: "600" }}>
                        {credit.customerId}
                      </div>
                    </td>

                    <td style={tdStyle}>
                      {credit.referral?.ambassador?.name || "—"}
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: "600",
                      }}
                    >
                      ₹{credit.amount.toFixed(2)}
                    </td>

                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 10px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "600",
                          background:
                            credit.status === "AVAILABLE"
                              ? "#e8f5e9"
                              : "#f1f1f1",
                          color:
                            credit.status === "AVAILABLE"
                              ? "#16803c"
                              : "#666",
                        }}
                      >
                        {credit.status}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      {credit.orderId || "—"}
                    </td>

                    <td style={tdStyle}>
                      {new Date(credit.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle = {
  padding: "14px 18px",
  borderBottom: "1px solid #ddd",
  fontWeight: "600",
  fontSize: "14px",
};

const tdStyle = {
  padding: "16px 18px",
  borderBottom: "1px solid #eee",
  fontSize: "14px",
};