import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const shop = session.shop;

  // Get all ambassadors
  const ambassadors = await db.ambassador.findMany({
    where: {
      shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Get all referrals
  const referrals = await db.referral.findMany({
    where: {
      shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Get all commissions
  const commissions = await db.commission.findMany({
    where: {
      shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Get all credits
  const credits = await db.referralCredit.findMany({
    where: {
      shop,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Get referral settings
  let settings = await db.referralSettings.findUnique({
    where: {
      shop,
    },
  });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await db.referralSettings.create({
      data: {
        shop,
        enabled: true,
        ambassadorEligibilityAmount: 10000,
        invitationValidityDays: 30,
        firstOrderCredit: 200,
        firstOrderCreditEnabled: true,
        commissionRate: 10,
        referralAttribution: "FIRST_VALID",
        commissionOnPaidOrders: true,
        excludeCancelledOrders: true,
      },
    });
  }

  // Calculate totals
  const totalAmbassadors = ambassadors.length;

  const totalReferrals = referrals.length;

  const totalOrders = ambassadors.reduce(
    (total, ambassador) => total + ambassador.totalOrders,
    0
  );

  const totalEarnings = ambassadors.reduce(
    (total, ambassador) => total + ambassador.totalEarnings,
    0
  );

  const totalCreditsIssued = credits.reduce(
    (total, credit) => total + credit.amount,
    0
  );

  const totalCreditsUsed = credits
    .filter((credit) => credit.status === "USED")
    .reduce((total, credit) => total + credit.amount, 0);

  const totalCommission = commissions.reduce(
    (total, commission) => total + commission.commissionAmount,
    0
  );

  const pendingCommission = commissions
    .filter((commission) => commission.status === "PENDING")
    .reduce((total, commission) => total + commission.commissionAmount, 0);

  const activeAmbassadors = ambassadors.filter(
    (ambassador) => ambassador.status === "ACTIVE"
  ).length;

  return {
    shop,
    ambassadors,
    referrals,
    commissions,
    credits,
    settings,
    stats: {
      totalAmbassadors,
      activeAmbassadors,
      totalReferrals,
      totalOrders,
      totalEarnings,
      totalCommission,
      pendingCommission,
      totalCreditsIssued,
      totalCreditsUsed,
    },
  };
};

export default function AdminDashboard() {
  const data = useLoaderData();

  const { stats, settings, ambassadors } = data;

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  return (
    <s-page heading="JOYSHOP Referral Program">
      {/* HEADER */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Referral & Ambassador Dashboard</s-heading>

          <s-text>
            Manage your ambassador program, referrals, customer credits and
            commissions from one place.
          </s-text>

          <s-stack direction="inline" gap="base">
            <s-button variant="primary">
              Manage Ambassadors
            </s-button>

            <s-button>
              Referral Settings
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* PROGRAM STATUS */}
      <s-section heading="Program Status">
        <s-grid
          gridTemplateColumns="repeat(4, 1fr)"
          gap="base"
        >
          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Program</s-text>

              <s-heading>
                {settings.enabled ? "ACTIVE" : "PAUSED"}
              </s-heading>

              <s-text>
                {settings.enabled
                  ? "Customers can participate"
                  : "Referral program is currently paused"}
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>First Order Credit</s-text>

              <s-heading>
                {settings.firstOrderCreditEnabled
                  ? money(settings.firstOrderCredit)
                  : "OFF"}
              </s-heading>

              <s-text>
                One-time customer credit
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Commission Rate</s-text>

              <s-heading>
                {settings.commissionRate}%
              </s-heading>

              <s-text>
                Ambassador commission
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Eligibility</s-text>

              <s-heading>
                {money(settings.ambassadorEligibilityAmount)}
              </s-heading>

              <s-text>
                Minimum purchase
              </s-text>
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>

      {/* MAIN STATISTICS */}
      <s-section heading="Overview">
        <s-grid
          gridTemplateColumns="repeat(4, 1fr)"
          gap="base"
        >
          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Ambassadors</s-text>

              <s-heading>
                {stats.totalAmbassadors}
              </s-heading>

              <s-text>
                {stats.activeAmbassadors} active
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Referred Customers</s-text>

              <s-heading>
                {stats.totalReferrals}
              </s-heading>

              <s-text>
                Customers joined through referrals
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Referral Orders</s-text>

              <s-heading>
                {stats.totalOrders}
              </s-heading>

              <s-text>
                Orders generated
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Ambassador Earnings</s-text>

              <s-heading>
                {money(stats.totalEarnings)}
              </s-heading>

              <s-text>
                Total earnings
              </s-text>
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>

      {/* MONEY OVERVIEW */}
      <s-section heading="Financial Overview">
        <s-grid
          gridTemplateColumns="repeat(3, 1fr)"
          gap="base"
        >
          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Total Commission</s-text>

              <s-heading>
                {money(stats.totalCommission)}
              </s-heading>

              <s-text>
                All generated commission
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Pending Commission</s-text>

              <s-heading>
                {money(stats.pendingCommission)}
              </s-heading>

              <s-text>
                Waiting for approval/payment
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Customer Credits Used</s-text>

              <s-heading>
                {money(stats.totalCreditsUsed)}
              </s-heading>

              <s-text>
                From {money(stats.totalCreditsIssued)} issued
              </s-text>
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>

      {/* TOP AMBASSADORS */}
      <s-section heading="Top Ambassadors">
        {ambassadors.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No ambassadors yet</s-heading>

            <s-text>
              When your first customer becomes an ambassador, their
              performance will appear here.
            </s-text>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            {ambassadors.slice(0, 10).map((ambassador) => (
              <s-section key={ambassador.id}>
                <s-grid
                  gridTemplateColumns="2fr 1fr 1fr 1fr"
                  gap="base"
                >
                  <s-stack direction="block" gap="small">
                    <s-heading>
                      {ambassador.name}
                    </s-heading>

                    <s-text>
                      {ambassador.email}
                    </s-text>

                    <s-text>
                      Code: {ambassador.referralCode}
                    </s-text>
                  </s-stack>

                  <s-stack direction="block" gap="small">
                    <s-text>Referrals</s-text>

                    <s-heading>
                      {ambassador.totalReferrals}
                    </s-heading>
                  </s-stack>

                  <s-stack direction="block" gap="small">
                    <s-text>Orders</s-text>

                    <s-heading>
                      {ambassador.totalOrders}
                    </s-heading>
                  </s-stack>

                  <s-stack direction="block" gap="small">
                    <s-text>Earnings</s-text>

                    <s-heading>
                      {money(ambassador.totalEarnings)}
                    </s-heading>
                  </s-stack>
                </s-grid>
              </s-section>
            ))}
          </s-stack>
        )}
      </s-section>

      {/* PROGRAM SETTINGS */}
      <s-section heading="Current Program Settings">
        <s-grid
          gridTemplateColumns="repeat(2, 1fr)"
          gap="base"
        >
          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>First Order Credit</s-text>

              <s-heading>
                {settings.firstOrderCreditEnabled
                  ? money(settings.firstOrderCredit)
                  : "Disabled"}
              </s-heading>

              <s-text>
                Automatically available to a referred customer on
                their first eligible order.
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Commission</s-text>

              <s-heading>
                {settings.commissionRate}%
              </s-heading>

              <s-text>
                Commission is generated according to the referral
                program rules.
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Referral Attribution</s-text>

              <s-heading>
                {settings.referralAttribution}
              </s-heading>

              <s-text>
                The first valid referral gets attribution.
              </s-text>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="small">
              <s-text>Credit Expiry</s-text>

              <s-heading>
                {settings.creditExpiryDays
                  ? `${settings.creditExpiryDays} days`
                  : "No expiry"}
              </s-heading>

              <s-text>
                Customer referral credit validity.
              </s-text>
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>

      {/* QUICK ACTIONS */}
      <s-section heading="Quick Actions">
        <s-grid
          gridTemplateColumns="repeat(3, 1fr)"
          gap="base"
        >
          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Ambassadors</s-heading>

              <s-text>
                View and manage all ambassadors.
              </s-text>

              <s-button>
                View Ambassadors
              </s-button>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Referrals</s-heading>

              <s-text>
                See customers who joined through referrals.
              </s-text>

              <s-button>
                View Referrals
              </s-button>
            </s-stack>
          </s-section>

          <s-section>
            <s-stack direction="block" gap="base">
              <s-heading>Settings</s-heading>

              <s-text>
                Change credit, commission and referral rules.
              </s-text>

              <s-button>
                Open Settings
              </s-button>
            </s-stack>
          </s-section>
        </s-grid>
      </s-section>

      {/* FOOTER */}
      <s-section>
        <s-stack direction="block" gap="small">
          <s-text>
            JOYSHOP Ambassador Program
          </s-text>

          <s-text>
            Referral management dashboard
          </s-text>
        </s-stack>
      </s-section>
    </s-page>
  );
}