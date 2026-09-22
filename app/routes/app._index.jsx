import { useState, useRef, useEffect } from "react";
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

  const totalCommission = commissions
    .filter((commission) => commission.status !== "REJECTED")
    .reduce(
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
    settings,
    stats: {
      totalAmbassadors,
      activeAmbassadors,
      totalReferrals,
      totalOrders,
      totalEarnings,
      totalCommission,
      pendingCommission,
    },
  };
};

export default function AdminDashboard() {
  const data = useLoaderData();

  const { stats, settings, ambassadors } = data;

  const [showAllAmbassadors, setShowAllAmbassadors] = useState(false);
  const toggleBtnRef = useRef(null);

  useEffect(() => {
    const btn = toggleBtnRef.current;
    if (!btn) return;

    function handleClick() {
      setShowAllAmbassadors((open) => !open);
    }

    btn.addEventListener("click", handleClick);
    return () => btn.removeEventListener("click", handleClick);
  }, []);

  const money = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;

  // Sort by actual performance (earnings), not creation date, so
  // "Top Ambassadors" is genuinely accurate.
  const rankedAmbassadors = [...ambassadors]
    .sort((a, b) => Number(b.totalEarnings || 0) - Number(a.totalEarnings || 0))
    .slice(0, 10);

  const topAmbassador = rankedAmbassadors[0];
  const restOfAmbassadors = rankedAmbassadors.slice(1);

  function AmbassadorRow({ ambassador }) {
    return (
      <s-section key={ambassador.id}>
        <s-grid gridTemplateColumns="2fr 1fr 1fr 1fr" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>{ambassador.name}</s-heading>
            <s-text>{ambassador.email}</s-text>
            <s-text>Code: {ambassador.referralCode}</s-text>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-text>Referrals</s-text>
            <s-heading>{ambassador.totalReferrals}</s-heading>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-text>Orders</s-text>
            <s-heading>{ambassador.totalOrders}</s-heading>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-text>Earnings</s-text>
            <s-heading>{money(ambassador.totalEarnings)}</s-heading>
          </s-stack>
        </s-grid>
      </s-section>
    );
  }

  return (
    <s-page heading="JOYSHOP Referral Program">
      {/* HEADER */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Referral & Ambassador Dashboard</s-heading>

          <s-text>
            Manage your ambassador program, referrals and commissions from
            one place.
          </s-text>

          <s-stack direction="inline" gap="base">
            <s-button variant="primary" href="/app/ambassadors">
              Manage Ambassadors
            </s-button>

            <s-button href="/app/settings">
              Referral Settings
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* PROGRAM STATUS */}
      <s-section heading="Program Status">
        <s-grid
          gridTemplateColumns="repeat(2, 1fr)"
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
          gridTemplateColumns="repeat(2, 1fr)"
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
            <AmbassadorRow ambassador={topAmbassador} />

            {restOfAmbassadors.length > 0 && (
              <s-stack direction="block" gap="base">
                <s-button ref={toggleBtnRef}>
                  {showAllAmbassadors
                    ? "Hide other ambassadors"
                    : `Show ${restOfAmbassadors.length} more ambassador${
                        restOfAmbassadors.length === 1 ? "" : "s"
                      }`}
                </s-button>

                {showAllAmbassadors && (
                  <s-stack direction="block" gap="base">
                    {restOfAmbassadors.map((ambassador) => (
                      <AmbassadorRow
                        key={ambassador.id}
                        ambassador={ambassador}
                      />
                    ))}
                  </s-stack>
                )}
              </s-stack>
            )}
          </s-stack>
        )}
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

              <s-button href="/app/ambassadors">
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

              <s-button href="/app/referrals">
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

              <s-button href="/app/settings">
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
