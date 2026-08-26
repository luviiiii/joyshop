import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const ambassador = await prisma.ambassador.findFirst({
    where: {
      shop: session.shop,
      status: "ACTIVE",
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      referrals: {
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!ambassador) {
    return {
      ambassador: null,
      referral: null,
    };
  }

  return {
    ambassador: {
      id: ambassador.id,
      name: ambassador.name,
      referralCode: ambassador.referralCode,
    },
    referral: ambassador.referrals[0]
      ? {
          id: ambassador.referrals[0].id,
          customerId: ambassador.referrals[0].referredCustomerId,
          name: ambassador.referrals[0].referredName,
          email: ambassador.referrals[0].referredEmail,
        }
      : null,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const ambassador = await prisma.ambassador.findFirst({
    where: {
      shop: session.shop,
      status: "ACTIVE",
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      referrals: {
        where: {
          status: "ACTIVE",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  if (!ambassador) {
    return {
      success: false,
      error: "No active ambassador found.",
    };
  }

  const referral = ambassador.referrals[0];

  if (!referral) {
    return {
      success: false,
      error: "No active referral found for the ambassador.",
    };
  }

  const settings = await prisma.referralSettings.findUnique({
    where: {
      shop: session.shop,
    },
  });

  const commissionRate = settings?.commissionRate ?? 10;

  // TEST ORDER
  const orderAmount = 500;
  const commissionAmount = Number(
    ((orderAmount * commissionRate) / 100).toFixed(2)
  );

  const testOrderId = `TEST-ORDER-${Date.now()}`;

  const commission = await prisma.commission.create({
    data: {
      shop: session.shop,

      ambassadorId: ambassador.id,

      referralId: referral.id,

      customerId: referral.referredCustomerId,

      orderId: testOrderId,

      orderAmount,

      commissionRate,

      commissionAmount,

      status: "PENDING",
    },
  });

  // Update ambassador statistics
  await prisma.ambassador.update({
    where: {
      id: ambassador.id,
    },
    data: {
      totalOrders: {
        increment: 1,
      },
      totalEarnings: {
        increment: commissionAmount,
      },
    },
  });

  return {
    success: true,
    orderId: commission.orderId,
    orderAmount,
    commissionRate,
    commissionAmount,
  };
};

export default function TestCommission() {
  const { ambassador, referral } = useLoaderData();
  const result = useActionData();

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "0 20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Test Commission</h1>

      <p style={{ color: "#666" }}>
        Development tool — creates a fake commission without creating a real
        Shopify order.
      </p>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "24px",
          marginTop: "24px",
          background: "#fff",
        }}
      >
        <h2>Test Details</h2>

        {ambassador ? (
          <>
            <p>
              <strong>Ambassador:</strong> {ambassador.name}
            </p>

            <p>
              <strong>Referral Code:</strong> {ambassador.referralCode}
            </p>
          </>
        ) : (
          <p style={{ color: "red" }}>
            No active ambassador found.
          </p>
        )}

        {referral ? (
          <>
            <p>
              <strong>Referred Customer:</strong>{" "}
              {referral.name || referral.customerId}
            </p>

            <p>
              <strong>Customer ID:</strong> {referral.customerId}
            </p>
          </>
        ) : (
          <p style={{ color: "red" }}>
            No active referral found.
          </p>
        )}

        <hr style={{ margin: "24px 0" }} />

        <p>
          <strong>Test Order Amount:</strong> ₹500
        </p>

        <p>
          <strong>Commission:</strong> Based on your program settings
        </p>

        <Form method="post">
          <button
            type="submit"
            disabled={!ambassador || !referral}
            style={{
              background: "#008060",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "12px 20px",
              fontSize: "16px",
              fontWeight: "600",
              cursor:
                ambassador && referral
                  ? "pointer"
                  : "not-allowed",
              opacity:
                ambassador && referral ? 1 : 0.5,
            }}
          >
            Create Test Commission
          </button>
        </Form>
      </div>

      {result?.success && (
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            borderRadius: "10px",
            background: "#e8f5e9",
            border: "1px solid #81c784",
          }}
        >
          <h2>✅ Test Commission Created</h2>

          <p>
            <strong>Order:</strong> {result.orderId}
          </p>

          <p>
            <strong>Order Amount:</strong> ₹{result.orderAmount}
          </p>

          <p>
            <strong>Commission Rate:</strong>{" "}
            {result.commissionRate}%
          </p>

          <p>
            <strong>Commission:</strong> ₹
            {result.commissionAmount}
          </p>

          <p>
            <strong>Status:</strong> PENDING
          </p>
        </div>
      )}

      {result?.error && (
        <div
          style={{
            marginTop: "24px",
            padding: "20px",
            borderRadius: "10px",
            background: "#ffebee",
            border: "1px solid #ef9a9a",
            color: "#b71c1c",
          }}
        >
          ❌ {result.error}
        </div>
      )}
    </div>
  );
}