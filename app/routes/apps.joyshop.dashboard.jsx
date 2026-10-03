import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  useFetcher,
  useLoaderData,
} from "react-router";
import { useState, useEffect, useRef } from "react";
import SettingsModal from "../components/SettingsModal";

/* =========================================================
   FONT — load Inter so iPhone, Android and computers all match
   (without it each device falls back to its own system font)
========================================================= */

export const links = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
  },
];

/* =========================================================
   STARTUP ERROR REPORTER
   Plain old-style JavaScript that runs even if the main app code
   fails to start (e.g. on an older iPhone). If the dashboard hasn't
   started after 6 seconds it sends the errors to the Railway logs,
   and with &debug=1 in the URL it also shows them on screen.
========================================================= */

const STARTUP_REPORTER = `
(function () {
  var errors = [];
  function push(msg) { if (errors.length < 15) errors.push(String(msg).slice(0, 600)); }

  window.addEventListener("error", function (e) {
    var t = e && e.target;
    if (t && t !== window && (t.src || t.href)) {
      push("FAILED TO LOAD: " + (t.src || t.href));
    } else {
      push((e.message || "error") + " @ " + (e.filename || "") + ":" + (e.lineno || "") + ":" + (e.colno || ""));
    }
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    push("UNHANDLED: " + ((r && (r.stack || r.message)) || r));
  });

  function send(report) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/apps/joyshop/client-log", true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(JSON.stringify(report));
    } catch (err) {}

    if (/[?&]debug=1/.test(location.search)) {
      var box = document.createElement("pre");
      box.style.cssText = "position:fixed;left:0;right:0;bottom:0;max-height:60vh;overflow:auto;margin:0;padding:12px;background:#3b0a0a;color:#fff;font:11px/1.4 monospace;white-space:pre-wrap;word-break:break-all;z-index:999999";
      box.textContent = JSON.stringify(report, null, 2);
      document.body.appendChild(box);
    }
  }

  setTimeout(function () {
    if (window.__JOYSHOP_STARTED) return;

    var assets = [];
    var nodes = document.querySelectorAll("script[src], link[rel=modulepreload]");
    for (var i = 0; i < nodes.length && i < 8; i++) assets.push(nodes[i].src || nodes[i].href);

    var report = {
      problem: "Dashboard JavaScript did not start",
      userAgent: navigator.userAgent,
      url: location.href,
      errors: errors,
      font: (function () { try { return getComputedStyle(document.body).fontFamily; } catch (e) { return "n/a"; } })(),
      test: {}
    };

    // Automatic test: can this device download the app's JS file?
    var testUrl = assets[0];
    report.test.file = testUrl || "none";

    if (!testUrl || !window.fetch) {
      report.diagnosis = "Could not run download test";
      send(report);
      return;
    }

    var pending = 2;
    function done() {
      pending--;
      if (pending > 0) return;

      if (report.test.plain === "ok" && report.test.cors === "ok") {
        report.diagnosis = "FILES OK - the JS downloads fine, so the problem is inside the code";
      } else if (report.test.plain === "ok") {
        report.diagnosis = "CORS - the server is not allowing justorganik.com to use the JS files";
      } else {
        report.diagnosis = "BLOCKED - this phone/network is blocking joyshop-production.up.railway.app";
      }
      send(report);
    }

    fetch(testUrl, { mode: "cors", cache: "no-store" })
      .then(function (r) { report.test.cors = r.ok ? "ok" : "HTTP " + r.status; })
      .catch(function (e) { report.test.cors = "FAILED: " + (e && e.message); })
      .then(done);

    fetch(testUrl, { mode: "no-cors", cache: "no-store" })
      .then(function () { report.test.plain = "ok"; })
      .catch(function (e) { report.test.plain = "FAILED: " + (e && e.message); })
      .then(done);
  }, 6000);
})();
`;

/* =========================================================
   LOADER
========================================================= */

export function headers() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
  };
}

export async function loader({ request }) {
  const { admin } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);

  const referralCode =
    url.searchParams.get("ref") || "KARINERU-57WS06";

  const ambassador =
    await db.ambassador.findFirst({
      where: {
        referralCode,
      },
    });

  if (!ambassador) {
    return {
      ambassador: {
        id: null,
        name: "Karine Ruby",
        email: "",
        referralCode: "KARINERU-57WS06",
        status: "ACTIVE",
      },

      stats: {
        referrals: 4,
        orders: 3,
        sales: 2525,
        commission: 252.5,
        pending: 0,
        approved: 150,
        paid: 102.5,
        available: 150,
      },

      payouts: [],

      referrals: [
        {
          id: "1",
          name: "Customer",
          email: "",
          status: "ORDER_PLACED",
          joinedAt: new Date(),
          orderValue: 2500,
          earnings: 250,
        },
        {
          id: "2",
          name: "Customer",
          email: "",
          status: "SIGNED_UP",
          joinedAt: new Date(),
          orderValue: 0,
          earnings: 0,
        },
      ],

      chartData: [
        { label: "1 Aug", value: 50 },
        { label: "5 Aug", value: 90 },
        { label: "10 Aug", value: 50 },
        { label: "15 Aug", value: 90 },
        { label: "20 Aug", value: 50 },
        { label: "24 Aug", value: 90 },
      ],

      totalEarningsAllTime: 252.5,

      earningsByPeriod: {
        thisMonth: 150,
        previousMonth: 102.5,
        last3Months: 252.5,
      },

      monthlyOrderValue: 2525,

      slabInfo: {
        isMaxTier: false,
        currentRate: 7,
        nextThreshold: 30000,
        nextRate: 10,
      },

      kycStatus: "NOT_SUBMITTED",
    };
  }

  const referrals =
    await db.referral.findMany({
      where: {
        ambassadorId: ambassador.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
    });

  const commissions =
    await db.commission.findMany({
      where: {
        ambassadorId: ambassador.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  /*
   * Backfill referredName/referredEmail/referredPhone for older
   * referrals created before we started saving these at
   * referral-creation time. Fetches from Shopify and persists
   * them so this only happens once per referral, not on every
   * dashboard load.
   */
  const referralsMissingName = referrals.filter(
    (referral) =>
      (!referral.referredName || !referral.referredPhone) &&
      referral.referredCustomerId
  );

  if (referralsMissingName.length > 0 && admin) {
    try {
      const idsToFetch = referralsMissingName.map((referral) =>
        referral.referredCustomerId.startsWith("gid://shopify/Customer/")
          ? referral.referredCustomerId
          : `gid://shopify/Customer/${referral.referredCustomerId}`
      );

      const namesResponse = await admin.graphql(
        `#graphql
        query GetCustomerNames($ids: [ID!]!) {
          nodes(ids: $ids) {
            id
            ... on Customer {
              firstName
              lastName
              email
              phone
            }
          }
        }`,
        { variables: { ids: idsToFetch } }
      );

      const namesResult = await namesResponse.json();
      const nodes = namesResult?.data?.nodes || [];

      for (const referral of referralsMissingName) {
        const gid = referral.referredCustomerId.startsWith(
          "gid://shopify/Customer/"
        )
          ? referral.referredCustomerId
          : `gid://shopify/Customer/${referral.referredCustomerId}`;

        const match = nodes.find((node) => node?.id === gid);

        if (!match) continue;

        const fullName =
          [match.firstName, match.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() || null;

        if (fullName || match.email || match.phone) {
          referral.referredName = fullName || referral.referredName;
          referral.referredEmail = match.email || referral.referredEmail;
          referral.referredPhone = match.phone || referral.referredPhone;

          await db.referral.update({
            where: { id: referral.id },
            data: {
              referredName: fullName || referral.referredName,
              referredEmail: match.email || referral.referredEmail,
              referredPhone: match.phone || referral.referredPhone,
            },
          });
        }
      }
    } catch (backfillError) {
      console.error("REFERRAL NAME BACKFILL ERROR:", backfillError);
      // Non-fatal — dashboard still renders with fallback names.
    }
  }

  const referralsWithStats = referrals.map((referral) => {
    const referralCommissions = commissions.filter(
      (commission) => commission.referralId === referral.id
    );

    const orderValue = referralCommissions.reduce(
      (total, commission) =>
        total + Number(commission.orderAmount || 0),
      0
    );

    return {
      id: referral.id,
      name: referral.referredName || "Customer",
      status:
        referralCommissions.length > 0
          ? "ORDER_PLACED"
          : "SIGNED_UP",
      joinedAt:
        referral.joinedAt || referral.createdAt,
      orderValue,
    };
  });

  /*
   * =====================================================
   * PERIOD-BASED EARNINGS TOTALS
   *
   * Precomputed here (not fetched client-side) so switching
   * between "This Month" / "Previous Month" / "Last 3 Months"
   * on the dashboard is instant, no extra round-trip needed.
   * Excludes REJECTED commissions from all totals.
   * =====================================================
   */

  /*
   * Month boundaries in INDIA time (IST, UTC+5:30), matching the
   * orders/paid webhook. The server runs in UTC, so plain
   * new Date(y, m, 1) would start each month at 5:30 AM IST.
   */
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const nowIst = new Date(Date.now() + IST_OFFSET_MS);
  const istYear = nowIst.getUTCFullYear();
  const istMonth = nowIst.getUTCMonth();

  const istMonthStart = (monthOffset) =>
    new Date(Date.UTC(istYear, istMonth + monthOffset, 1) - IST_OFFSET_MS);

  const thisMonthStart = istMonthStart(0);
  const nextMonthStart = istMonthStart(1);
  const previousMonthStart = istMonthStart(-1);
  const last3MonthsStart = istMonthStart(-2);

  function sumEarningsInRange(start, end) {
    return commissions
      .filter((commission) => commission.status !== "REJECTED")
      .filter((commission) => {
        const created = new Date(commission.createdAt);
        return created >= start && created < end;
      })
      .reduce(
        (total, commission) =>
          total + Number(commission.commissionAmount || 0),
        0
      );
  }

  const totalEarningsAllTime = commissions
    .filter((commission) => commission.status !== "REJECTED")
    .reduce(
      (total, commission) =>
        total + Number(commission.commissionAmount || 0),
      0
    );

  const earningsByPeriod = {
    thisMonth: sumEarningsInRange(thisMonthStart, nextMonthStart),
    previousMonth: sumEarningsInRange(previousMonthStart, thisMonthStart),
    last3Months: sumEarningsInRange(last3MonthsStart, nextMonthStart),
  };

  /*
   * =====================================================
   * MONTHLY ORDER VALUE + COMMISSION TIER INFO
   *
   * Mirrors the slab logic in webhooks.app.orders_paid.jsx —
   * shown here so the ambassador can see what rate they're
   * currently earning and what it takes to reach the next
   * tier.
   * =====================================================
   */

  const monthlyOrderValue = commissions
    .filter((commission) => commission.status !== "REJECTED")
    .filter((commission) => {
      const created = new Date(commission.createdAt);
      return created >= thisMonthStart && created < nextMonthStart;
    })
    .reduce(
      (total, commission) => total + Number(commission.orderAmount || 0),
      0
    );

  function getSlabInfo(monthlyTotal) {
    if (monthlyTotal <= 30000) {
      return {
        currentRate: 7,
        nextRate: 10,
        nextThreshold: 30000,
        isMaxTier: false,
      };
    }

    if (monthlyTotal <= 60000) {
      return {
        currentRate: 10,
        nextRate: 15,
        nextThreshold: 60000,
        isMaxTier: false,
      };
    }

    return {
      currentRate: 15,
      nextRate: null,
      nextThreshold: null,
      isMaxTier: true,
    };
  }

  const slabInfo = getSlabInfo(monthlyOrderValue);

  const groupedChartData = {};

  commissions.forEach((commission) => {
    const date = new Date(commission.createdAt);
    const key = date.toISOString().slice(0, 10);

    if (!groupedChartData[key]) {
      groupedChartData[key] = {
        label: `${date.getDate()} ${date.toLocaleString("en-US", { month: "short" })}`,
        value: 0,
      };
    }

    groupedChartData[key].value += Number(commission.commissionAmount || 0);
  });

  const chartData =
    Object.values(groupedChartData)
      .slice(-7)
      .map((item) => ({
        ...item,
        value: Number(item.value.toFixed(2)),
      }));

  const totalCommission = commissions
    .filter((commission) => commission.status !== "REJECTED")
    .reduce(
      (total, commission) => total + Number(commission.commissionAmount || 0),
      0
    );

  const pendingCommission = commissions
    .filter((commission) => commission.status === "PENDING")
    .reduce((total, commission) => total + Number(commission.commissionAmount || 0), 0);

  const approvedCommission = commissions
    .filter((commission) => commission.status === "APPROVED")
    .reduce((total, commission) => total + Number(commission.commissionAmount || 0), 0);

  const paidCommission = commissions
    .filter((commission) => commission.status === "PAID")
    .reduce((total, commission) => total + Number(commission.commissionAmount || 0), 0);

  const payouts = await db.payout.findMany({
    where: { ambassadorId: ambassador.id },
    orderBy: { createdAt: "desc" },
  });

  const allocatedPayouts = payouts
    .filter(
      (payout) =>
        payout.status === "PENDING" ||
        payout.status === "APPROVED" ||
        payout.status === "PAID"
    )
    .reduce((total, payout) => total + Number(payout.amount || 0), 0);

  const availableBalance = Math.max(0, approvedCommission - allocatedPayouts);

  const totalSales = commissions
    .filter((commission) => commission.status !== "REJECTED")
    .reduce(
      (total, commission) => total + Number(commission.orderAmount || 0),
      0
    );

  const validOrderCount = commissions.filter(
    (commission) => commission.status !== "REJECTED"
  ).length;

  const stats = {
    referrals: referrals.length,
    orders: validOrderCount,
    sales: totalSales,
    commission: totalCommission,
    pending: pendingCommission,
    approved: approvedCommission,
    paid: paidCommission,
    available: availableBalance,
  };

  /*
   * =====================================================
   * KYC STATUS
   *
   * Ambassadors are created instantly via the popup now,
   * without KYC — but they still need to submit PAN/Aadhaar/
   * cancelled cheque within 7 days to actually receive
   * rewards. This drives the "Verify your KYC" prompt shown
   * on the dashboard.
   * =====================================================
   */

  const kycApplication = await db.ambassadorApplication.findFirst({
    where: {
      shop: ambassador.shop,
      customerId: ambassador.customerId,
    },
  });

  const kycStatus = kycApplication
    ? kycApplication.status
    : "NOT_SUBMITTED";

  return {
    ambassador: {
      id: ambassador.id,
      name: ambassador.name,
      email: ambassador.email,
      referralCode: ambassador.referralCode,
      status: ambassador.status,
    },
    stats,
    chartData,
    kycStatus,
    payouts: payouts.slice(0, 10).map((payout) => ({
      id: payout.id,
      amount: Number(payout.amount || 0),
      method: payout.method,
      status: payout.status,
      requestedAt: payout.requestedAt,
      processedAt: payout.processedAt,
    })),
    referrals: referralsWithStats,
    totalEarningsAllTime,
    earningsByPeriod,
    monthlyOrderValue,
    slabInfo,
  };
}

/* =========================================================
   ACTION
========================================================= */

export async function action({ request }) {
  await authenticate.public.appProxy(request);

  const formData = await request.formData();
  const actionType = formData.get("action");
  const ambassadorId = formData.get("ambassadorId");
  const requestedAmount = Number(formData.get("amount") || 0);

  if (actionType === "request-payout") {
    if (!ambassadorId) {
      return { success: false, error: "Ambassador not found." };
    }

    const ambassador = await db.ambassador.findUnique({
      where: { id: ambassadorId },
    });

    if (!ambassador) {
      return { success: false, error: "Ambassador not found." };
    }

    const commissions = await db.commission.findMany({
      where: { ambassadorId: ambassador.id, status: "APPROVED" },
    });

    const approvedCommission = commissions.reduce(
      (total, commission) => total + Number(commission.commissionAmount || 0),
      0
    );

    const payouts = await db.payout.findMany({
      where: {
        ambassadorId: ambassador.id,
        status: { in: ["PENDING", "APPROVED", "PAID"] },
      },
    });

    const allocatedPayouts = payouts.reduce(
      (total, payout) => total + Number(payout.amount || 0),
      0
    );

    const availableBalance = Math.max(0, approvedCommission - allocatedPayouts);

    if (availableBalance <= 0) {
      return { success: false, error: "You don't have any available balance for payout." };
    }

    const amount = requestedAmount > 0 ? requestedAmount : availableBalance;

    if (amount > availableBalance) {
      return {
        success: false,
        error: `Maximum available payout is ₹${availableBalance.toFixed(2)}.`,
      };
    }

    const minimumPayout = 100;

    if (amount < minimumPayout) {
      return { success: false, error: `Minimum payout amount is ₹${minimumPayout}.` };
    }

    const existingPendingPayout = await db.payout.findFirst({
      where: {
        ambassadorId: ambassador.id,
        status: { in: ["PENDING", "APPROVED"] },
      },
    });

    if (existingPendingPayout) {
      return {
        success: false,
        error: "You already have a payout request waiting for processing.",
      };
    }

    const payout = await db.payout.create({
      data: {
        shop: ambassador.shop,
        ambassadorId: ambassador.id,
        amount,
        method: "MANUAL",
        status: "PENDING",
        requestedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Your payout request has been submitted successfully.",
      payout: { id: payout.id, amount: Number(payout.amount), status: payout.status },
    };
  }

  return { success: false, error: "Invalid action." };
}

/* =========================================================
   ICONS
========================================================= */

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

function IconPeople() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.2c2.6.3 4.5 2.6 4.5 5.3" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V10M11 20V4M18 20v-7" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </svg>
  );
}

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" strokeLinejoin="round" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 3.6" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 15l6-6" />
      <path d="M10 7l1-1a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M14 17l-1 1a3.5 3.5 0 0 1-5-5l1-1" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.47 14.38c-.29-.15-1.71-.84-1.98-.94-.27-.1-.46-.15-.66.15-.19.29-.75.94-.92 1.13-.17.19-.34.22-.63.07-.29-.15-1.22-.45-2.32-1.43-.86-.76-1.44-1.71-1.61-2-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.49.1-.19.05-.36-.02-.51-.07-.15-.66-1.59-.9-2.18-.24-.57-.48-.49-.66-.5-.17-.01-.36-.01-.56-.01-.19 0-.51.07-.78.36-.27.29-1.02 1-1.02 2.43 0 1.43 1.04 2.82 1.19 3.01.15.19 2.05 3.13 4.96 4.39.69.3 1.23.48 1.65.61.69.22 1.32.19 1.82.11.55-.08 1.71-.7 1.96-1.38.24-.68.24-1.26.17-1.38-.07-.12-.27-.19-.56-.34z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.46 1.28 4.92L2 22l5.29-1.39a9.87 9.87 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.51 2 12.04 2zm0 18.11h-.01a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.14.82.84-3.06-.2-.31a8.15 8.15 0 0 1-1.26-4.34c0-4.53 3.69-8.21 8.25-8.21 2.2 0 4.27.86 5.83 2.42a8.15 8.15 0 0 1 2.41 5.79c0 4.53-3.69 8.21-8.24 8.21z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

export default function AmbassadorDashboard() {
  const {
    ambassador,
    stats,
    payouts,
    referrals,
    chartData,
    totalEarningsAllTime,
    earningsByPeriod,
    monthlyOrderValue,
    slabInfo,
    kycStatus,
  } = useLoaderData();

  const payoutFetcher = useFetcher();

  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState("thisMonth");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Tells the startup reporter the app is running fine.
  useEffect(() => {
    window.__JOYSHOP_STARTED = true;
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("joyshop_dashboard_theme");
      if (saved === "dark") {
        setDarkMode(true);
      }
    } catch (error) {
      // localStorage unavailable — default to light mode.
    }
  }, []);

  function toggleDarkMode() {
    setDarkMode((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(
          "joyshop_dashboard_theme",
          next ? "dark" : "light"
        );
      } catch (error) {
        // Ignore — theme just won't persist across visits.
      }

      return next;
    });
  }

  useEffect(() => {
    if (!showProfileMenu && !showSettingsModal) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setShowProfileMenu(false);
        setShowSettingsModal(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showProfileMenu, showSettingsModal]);

  // While the mobile menu is open: stop the page scrolling behind it, close on Escape
  useEffect(() => {
    if (!mobileNavOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKey(event) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [mobileNavOpen]);

  const referralLink = `https://justorganik.com/apps/joyshop/ref/${ambassador.referralCode}`;

  const whatsappShareMessage = `Discover Just Organik — certified organic groceries, delivered home.\n\nUse my link to get your welcome credit on your first order:\n${referralLink}`;
  const whatsappShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappShareMessage)}`;
  const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`;

  const actionData = payoutFetcher.data;
  const isSubmitting = payoutFetcher.state === "submitting";

  function money(value) {
    return `₹${Number(value || 0).toFixed(2)}`;
  }

  function goToSection(sectionId) {
    setActiveSection(sectionId);

    const wasNavOpen = mobileNavOpen;
    setMobileNavOpen(false);

    const scrollToSection = () => {
      const element = document.getElementById(sectionId);
      if (!element) return;

      element.scrollIntoView({ behavior: "smooth", block: "start" });

      element.classList.remove("section-glow-flash");
      void element.offsetWidth;
      element.classList.add("section-glow-flash");

      window.setTimeout(() => {
        element.classList.remove("section-glow-flash");
      }, 1800);
    };

    // Wait for the drawer to slide away before scrolling
    if (wasNavOpen) {
      window.setTimeout(scrollToSection, 280);
    } else {
      scrollToSection();
    }
  }

  /* ---------- Toast ---------- */

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }

  /* ---------- Copy (works on iPhone too) ---------- */

  // iOS Safari only copies from a VISIBLE, selected element, so the
  // old "move it off-screen" trick silently failed there.
  function legacyCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.contentEditable = "true";
    textarea.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;";
    document.body.appendChild(textarea);

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textarea);
    selection.removeAllRanges();
    selection.addRange(range);
    textarea.setSelectionRange(0, text.length);

    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }

    selection.removeAllRanges();
    document.body.removeChild(textarea);
    return ok;
  }

  async function copyText(text, onDone) {
    if (!text) return false;

    let ok = false;

    // Modern API first (needs HTTPS + a tap, which we have)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (error) {
        ok = false;
      }
    }

    if (!ok) ok = legacyCopy(text);

    if (ok) {
      onDone?.(true);
      window.setTimeout(() => onDone?.(false), 2000);
    } else {
      // Last resort: select the link so they can long-press → Copy
      const input = document.querySelector(".link-row input");
      if (input) {
        input.focus();
        input.setSelectionRange(0, input.value.length);
      }
      showToast("Couldn't copy automatically — press and hold the link to copy it.");
    }

    return ok;
  }

  function copyReferralLink() {
    return copyText(referralLink, setCopied);
  }

  /* ---------- Open Facebook / Instagram APPS on phones ---------- */

  function getMobileOS() {
    const ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return "android";
    if (
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ) {
      return "ios";
    }
    return null;
  }

  // Try the app; if it isn't installed (page still visible after a
  // moment), fall back to the website.
  function openAppWithFallback(appUrl, webUrl) {
    let timer = null;

    function cancel() {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", cancel);
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") cancel();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", cancel);

    timer = window.setTimeout(() => {
      cancel();
      window.location.href = webUrl;
    }, 1800);

    window.location.href = appUrl;
  }

  function shareToFacebook(event) {
    const os = getMobileOS();
    if (!os) return; // computer: normal link opens Facebook's share page

    event.preventDefault();

    if (os === "android") {
      // Opens the Facebook app (falls back to the browser if not installed)
      window.location.href =
        "intent://www.facebook.com/sharer/sharer.php?u=" +
        encodeURIComponent(referralLink) +
        "#Intent;scheme=https;package=com.facebook.katana;S.browser_fallback_url=" +
        encodeURIComponent(facebookShareUrl) +
        ";end";
      return;
    }

    // iPhone: open Facebook's share screen inside the Facebook app
    openAppWithFallback(
      "fb://facewebmodal/f?href=" + encodeURIComponent(facebookShareUrl),
      facebookShareUrl
    );
  }

  function shareToInstagram(event) {
    event.preventDefault();

    // Instagram doesn't let websites pre-fill a post, so we copy the
    // link and open the app — they paste it into a story, DM or bio.
    copyReferralLink();
    showToast("Link copied! Paste it in your Instagram story, post or DM.");

    const os = getMobileOS();

    if (os === "ios") {
      openAppWithFallback("instagram://app", "https://www.instagram.com/");
    } else if (os === "android") {
      window.location.href =
        "intent://instagram.com/#Intent;scheme=https;package=com.instagram.android;S.browser_fallback_url=" +
        encodeURIComponent("https://www.instagram.com/") +
        ";end";
    } else {
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    }
  }

  const initials =
    ambassador.name?.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase() || "AM";

  const maximum = Math.max(...chartData.map((item) => Number(item.value || 0)), 100);

  return (
    <div className="dashboard" data-theme={darkMode ? "dark" : "light"}>
      <script dangerouslySetInnerHTML={{ __html: STARTUP_REPORTER }} />

      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
          >
            <IconMenu />
          </button>

          <div className="logo">
            JUST
            <span>ORGANIK</span>
          </div>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleDarkMode}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <IconSun /> : <IconMoon />}
          </button>

          <div className="profile-menu-wrapper">
          <button
            type="button"
            className="top-profile-button"
            aria-expanded={showProfileMenu}
            aria-haspopup="menu"
            onClick={() => setShowProfileMenu((open) => !open)}
          >
            <div className="avatar">{initials}</div>
            <div className="top-profile-info">
              <strong>{ambassador.name}</strong>
            </div>
            <span className="profile-arrow">{showProfileMenu ? "⌃" : "⌄"}</span>
          </button>

          {showProfileMenu && (
            <div className="profile-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowProfileMenu(false);
                  setShowSettingsModal(true);
                }}
              >
                <span className="dropdown-icon"><IconUser /></span>
                <span>Settings</span>
              </button>

              <div className="profile-dropdown-divider" />

              <button
                type="button"
                role="menuitem"
                className="profile-logout"
                onClick={() => { window.location.href = "/pages/account"; }}
              >
                <span className="dropdown-icon">↪</span>
                <span>Log out</span>
              </button>
            </div>
          )}
          </div>
        </div>
      </header>

      <div className="layout">

        <aside
          className={mobileNavOpen ? "sidebar open" : "sidebar"}
          aria-label="Dashboard navigation"
        >
          <div className="sidebar-drawer-head">
            <div className="logo">
              JUST
              <span>ORGANIK</span>
            </div>
            <button
              type="button"
              className="sidebar-close"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close menu"
            >
              <IconClose />
            </button>
          </div>

          <nav className="sidebar-nav">
            <button
              type="button"
              onClick={() => goToSection("dashboard")}
              className={activeSection === "dashboard" ? "nav-item active" : "nav-item"}
            >
              <span className="nav-icon"><IconHome /></span>
              Dashboard
            </button>

            <button
              type="button"
              onClick={() => goToSection("referrals")}
              className={activeSection === "referrals" ? "nav-item active" : "nav-item"}
            >
              <span className="nav-icon"><IconPeople /></span>
              Referrals
            </button>

            <button
              type="button"
              onClick={() => goToSection("orders")}
              className={activeSection === "orders" ? "nav-item active" : "nav-item"}
            >
              <span className="nav-icon"><IconChart /></span>
              Commissions
            </button>

            <button
              type="button"
              onClick={() => goToSection("kyc")}
              className={activeSection === "kyc" ? "nav-item active" : "nav-item"}
            >
              <span className="nav-icon"><IconUser /></span>
              Verify KYC
            </button>

            <button
              type="button"
              onClick={() => goToSection("payouts")}
              className={activeSection === "payouts" ? "nav-item active" : "nav-item"}
            >
              <span className="nav-icon"><IconWallet /></span>
              Payouts
            </button>

            <button
              type="button"
              onClick={() => goToSection("profile")}
              className={activeSection === "profile" ? "nav-item active" : "nav-item"}
            >
              <span className="nav-icon"><IconUser /></span>
              Profile
            </button>

            <button
              type="button"
              onClick={() => goToSection("support")}
              className={activeSection === "support" ? "nav-item active" : "nav-item"}
            >
              <span className="nav-icon"><IconHelp /></span>
              Help &amp; Support
            </button>
          </nav>
        </aside>

        <div
          className={mobileNavOpen ? "sidebar-backdrop open" : "sidebar-backdrop"}
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />

        <main className="main">

          <section
            id="dashboard"
            className={activeSection === "dashboard" ? "hero section-glow" : "hero"}
          >
            <div className="hero-content">
              <div className="hero-text">
                <h1>
                  Welcome back,
                  <br />
                  {ambassador.name}!
                </h1>
                <p>
                  Share Just Organik with your friends and earn rewards for a
                  healthier tomorrow.
                </p>
                <button
                  type="button"
                  className="hero-button"
                  onClick={() => goToSection("marketing")}
                >
                  Keep Referring
                  <span className="hero-button-arrow">→</span>
                </button>
              </div>
            </div>
          </section>

          {actionData?.success && actionData?.message && (
            <div className="alert success">✓ {actionData.message}</div>
          )}

          {actionData?.error && <div className="alert error">! {actionData.error}</div>}

          <section className="headline-stats">
            <div className="headline-stat">
              <div className="headline-stat-icon icon-green"><IconPeople /></div>
              <div>
                <strong>{stats.referrals}</strong>
                <span>Total Referrals</span>
              </div>
            </div>

            <div className="headline-stat">
              <div className="headline-stat-icon icon-peach"><IconGrid /></div>
              <div>
                <strong>{stats.orders}</strong>
                <span>Orders Placed</span>
              </div>
            </div>

            <div className="headline-stat">
              <div className="headline-stat-icon icon-green">₹</div>
              <div>
                <strong>{money(totalEarningsAllTime)}</strong>
                <span>Total Earnings</span>
              </div>
            </div>

            <div className="headline-stat">
              <div className="headline-stat-icon icon-peach">₹</div>
              <div>
                <strong>{money(monthlyOrderValue)}</strong>
                <span>Order Value This Month</span>
              </div>
            </div>

            <div className="headline-stat">
              <div className="headline-stat-icon icon-green">₹</div>
              <div>
                <strong>{money(earningsByPeriod.thisMonth)}</strong>
                <span>Earnings This Month</span>
              </div>
            </div>
          </section>

          <section className="tier-banner">
            {slabInfo.isMaxTier ? (
              <p>
                🎉 You're earning our top rate of <strong>15% commission</strong> on
                every referred order this month — nice work!
              </p>
            ) : (
              <p>
                You're currently earning <strong>{slabInfo.currentRate}% commission</strong> on
                this month's referred orders (₹{monthlyOrderValue.toLocaleString("en-IN")} so far).
                Get your referrals to <strong>₹{slabInfo.nextThreshold.toLocaleString("en-IN")}</strong> in
                orders this month and your rate jumps to <strong>{slabInfo.nextRate}%</strong> —
                keep sharing your link!
              </p>
            )}

            <p className="tier-banner-scale">
              Up to ₹30,000 → 7% &nbsp;•&nbsp; ₹30,001–₹60,000 → 10% &nbsp;•&nbsp; ₹60,001+ → 15%
            </p>
          </section>

          {kycStatus !== "APPROVED" && (
            <section
              id="kyc"
              className={activeSection === "kyc" ? "kyc-banner section-glow" : "kyc-banner"}
            >
              <div className="kyc-banner-left">
                <div className="kyc-banner-icon">📋</div>
                <div>
                  <h3>Verify your KYC</h3>

                  {kycStatus === "PENDING" ? (
                    <p>
                      Your documents are submitted and under review.
                      We'll notify you once they're verified.
                    </p>
                  ) : kycStatus === "REJECTED" ? (
                    <p>
                      Your previous submission couldn't be verified.
                      Please resubmit your PAN, Aadhaar, and
                      cancelled cheque to start receiving rewards.
                    </p>
                  ) : (
                    <p>
                      Upload your PAN card, Aadhaar card, and a
                      cancelled cheque within 7 days to start
                      receiving your referral rewards.
                    </p>
                  )}
                </div>
              </div>

              {kycStatus === "PENDING" ? (
                <span className="kyc-pending-badge">Under Review</span>
              ) : (
                <a
                  href="https://www.justorganik.com/pages/become-an-ambassador"
                  className="kyc-banner-button"
                >
                  {kycStatus === "REJECTED" ? "Resubmit KYC" : "Complete KYC"}
                  <span aria-hidden="true">→</span>
                </a>
              )}
            </section>
          )}

          <section className="link-only-grid">
            <div className="link-card">
              <div className="link-card-heading">
                <IconLink />
                <h3>Your Referral Link</h3>
              </div>

              <div className="link-row">
                <input
                  type="text"
                  value={referralLink}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
                <button type="button" className="copy-btn" onClick={copyReferralLink}>
                  <IconCopy />
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              <div className="share-row">
                <span>Share via</span>
                <a href={whatsappShareUrl} target="_blank" rel="noopener noreferrer" className="share-icon whatsapp" aria-label="Share on WhatsApp"><IconWhatsApp /></a>
                <a href={facebookShareUrl} target="_blank" rel="noopener noreferrer" className="share-icon facebook" onClick={shareToFacebook} aria-label="Share on Facebook"><IconFacebook /></a>
                <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="share-icon instagram" onClick={shareToInstagram} aria-label="Share on Instagram"><IconInstagram /></a>
              </div>
            </div>
          </section>

          <section
            id="referrals"
            className={activeSection === "referrals" ? "panel section-glow" : "panel"}
          >
            <div className="panel-heading">
              <h2>Recent Referrals</h2>
            </div>

            {referrals.length === 0 ? (
              <div className="empty-state">
                <strong>No referrals yet</strong>
                <p>Share your referral link to get started.</p>
              </div>
            ) : (
              <>
                <div className="referral-table-wrap">
                  <table className="referral-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Order Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllReferrals ? referrals : referrals.slice(0, 5)).map(
                        (referral) => (
                          <tr key={referral.id}>
                            <td>{referral.name}</td>
                            <td>{formatDate(referral.joinedAt)}</td>
                            <td>
                              <span
                                className={
                                  referral.status === "ORDER_PLACED"
                                    ? "status-pill placed"
                                    : "status-pill signed-up"
                                }
                              >
                                {referral.status === "ORDER_PLACED" ? "Order Placed" : "Signed Up"}
                              </span>
                            </td>
                            <td>{referral.orderValue > 0 ? money(referral.orderValue) : "-"}</td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>

                {referrals.length > 5 && (
                  <button
                    type="button"
                    className="referrals-toggle"
                    onClick={() => setShowAllReferrals((open) => !open)}
                  >
                    {showAllReferrals
                      ? "Show less"
                      : `Show all ${referrals.length} referrals`}
                  </button>
                )}
              </>
            )}
          </section>

          <section
            id="payouts"
            className={activeSection === "payouts" ? "payout-banner section-glow" : "payout-banner"}
          >
            <div className="payout-left">
              <div className="payout-round-icon">₹</div>
              <div>
                <span className="section-label">AVAILABLE BALANCE</span>
                <h2>{money(stats.available)}</h2>
                <p>Your approved commission is ready for withdrawal.</p>
              </div>
            </div>

            <div className="payout-action">
              <p className="payout-note">
                You'll get your commission at the end of every month.
              </p>
            </div>
          </section>

          <div className="two-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-label">EARNINGS</span>
                  <h2>Earnings Overview</h2>
                </div>
              </div>

              <div className="earnings-total">
                <strong>{money(totalEarningsAllTime)}</strong>
                <span>Total Earnings</span>
              </div>

              <div className="earnings-period-tabs">
                <button
                  type="button"
                  className={earningsPeriod === "thisMonth" ? "earnings-period-tab active" : "earnings-period-tab"}
                  onClick={() => setEarningsPeriod("thisMonth")}
                >
                  This Month
                </button>
                <button
                  type="button"
                  className={earningsPeriod === "previousMonth" ? "earnings-period-tab active" : "earnings-period-tab"}
                  onClick={() => setEarningsPeriod("previousMonth")}
                >
                  Previous Month
                </button>
                <button
                  type="button"
                  className={earningsPeriod === "last3Months" ? "earnings-period-tab active" : "earnings-period-tab"}
                  onClick={() => setEarningsPeriod("last3Months")}
                >
                  Last 3 Months
                </button>
              </div>

              <div className="earnings-period-value">
                <strong>{money(earningsByPeriod[earningsPeriod] || 0)}</strong>
                <span>
                  {earningsPeriod === "thisMonth" && "Earnings this month"}
                  {earningsPeriod === "previousMonth" && "Earnings last month"}
                  {earningsPeriod === "last3Months" && "Earnings over the last 3 months"}
                </span>
              </div>

              {chartData.length === 0 ? (
                <div className="empty-state">
                  <strong>No earnings yet</strong>
                  <p>Your earnings will appear here once you start earning commission.</p>
                </div>
              ) : (
                <div className="chart">
                  <div className="chart-grid">
                    <div className="grid-line top"><span>₹{maximum}</span></div>
                    <div className="grid-line middle"><span>₹{Math.round(maximum / 2)}</span></div>
                    <div className="grid-line bottom"><span>₹0</span></div>

                    <div className="bars">
                      {chartData.map((item, index) => {
                        const value = Number(item.value || 0);
                        const height = Math.max(5, Math.min(100, (value / maximum) * 100));

                        return (
                          <div className="bar-column" key={`${item.label}-${index}`}>
                            <div className="bar-value">{money(value)}</div>
                            <div className="earning-bar" style={{ height: `${height}%` }} />
                            <span className="bar-label">{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section
              id="orders"
              className={activeSection === "orders" ? "panel section-glow" : "panel"}
            >
              <div className="panel-heading">
                <div>
                  <span className="section-label">COMMISSIONS</span>
                  <h2>Orders &amp; Commissions</h2>
                </div>
              </div>

              <div className="commission-grid">
                <div className="commission-box">
                  <span>Pending</span>
                  <strong>{money(stats.pending)}</strong>
                </div>
                <div className="commission-box approved-box">
                  <span>Approved</span>
                  <strong>{money(stats.approved)}</strong>
                </div>
                <div className="commission-box paid-box">
                  <span>Paid</span>
                  <strong>{money(stats.paid)}</strong>
                </div>
              </div>

              <div className="order-summary">
                <div>
                  <span>Total Orders</span>
                  <strong>{stats.orders}</strong>
                </div>
                <div>
                  <span>Total Sales</span>
                  <strong>{money(stats.sales)}</strong>
                </div>
                <div>
                  <span>Order Value This Month</span>
                  <strong>{money(monthlyOrderValue)}</strong>
                </div>
              </div>
            </section>
          </div>

          <section
            id="marketing"
            className={
              activeSection === "marketing" ? "panel referral-panel section-glow" : "panel referral-panel"
            }
          >
            <div className="panel-heading">
              <div>
                <span className="section-label">MARKETING TOOLS</span>
                <h2>Grow Your Reach</h2>
                <p className="panel-description">Share your link everywhere your community is.</p>
              </div>
            </div>

            <div className="share-row wide">
              <a href={whatsappShareUrl} target="_blank" rel="noopener noreferrer" className="share whatsapp"><IconWhatsApp /> WhatsApp</a>
              <a href={facebookShareUrl} target="_blank" rel="noopener noreferrer" className="share facebook" onClick={shareToFacebook}><IconFacebook /> Facebook</a>
              <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" className="share instagram" onClick={shareToInstagram}><IconInstagram /> Instagram</a>
            </div>
          </section>

          <section className="panel payout-history">
            <div className="panel-heading">
              <div>
                <span className="section-label">PAYOUTS</span>
                <h2>Payout History</h2>
              </div>
            </div>

            <div className="payout-history-list">
              {payouts.length === 0 ? (
                <div className="empty-state">
                  <strong>No payout requests</strong>
                  <p>Your payout history will appear here.</p>
                </div>
              ) : (
                payouts.map((payout) => (
                  <div className="history-row" key={payout.id}>
                    <div className="history-icon">₹</div>
                    <div className="history-info">
                      <strong>{money(payout.amount)}</strong>
                      <span>{formatDate(payout.requestedAt)}</span>
                    </div>
                    <span className={`history-status ${String(payout.status || "").toLowerCase()}`}>
                      {payout.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section
            id="profile"
            className={activeSection === "profile" ? "small-panel section-glow" : "small-panel"}
          >
            <div className="small-icon"><IconUser /></div>
            <div>
              <span className="section-label">PROFILE</span>
              <h3>{ambassador.name}</h3>
              <p>Referral Code: {ambassador.referralCode}</p>
              <p>{ambassador.email || "Email not available"}</p>
            </div>
          </section>

          <section
            id="support"
            className={activeSection === "support" ? "small-panel section-glow" : "small-panel"}
          >
            <div className="small-icon"><IconHelp /></div>
            <div>
              <span className="section-label">NEED HELP?</span>
              <h3>Ambassador Support</h3>
              <p>Contact the Just Organik team if you need assistance.</p>
            </div>
          </section>

        </main>
      </div>

      <SettingsModal
        open={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        ambassador={ambassador}
        referralLink={referralLink}
        copied={copied}
        onCopy={copyReferralLink}
        kycStatus={kycStatus}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <footer className="footer">
        <div>JUST ORGANIK</div>
        <span>© 2026 Just Organik. All rights reserved.</span>
      </footer>

      <style>{styles}</style>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "Recently";

  try {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Recently";
  }
}

const styles = `
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: #fafdf7; color: #1f2d22; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
button, input { font: inherit; }
button { cursor: pointer; }
section, .panel, .payout-banner, .small-panel { scroll-margin-top: 95px; }
svg { width: 100%; height: 100%; }

.dashboard { min-height: 100vh; overflow-x: clip; }

.section-glow { border-color: #a8dcb7 !important; box-shadow: 0 0 0 2px rgba(20,83,45,0.08), 0 12px 35px rgba(20,83,45,0.10); transition: box-shadow .25s ease, border-color .25s ease; }
.section-glow-flash { border-color: #4a9d63 !important; box-shadow: 0 0 0 4px rgba(20,83,45,0.14), 0 0 30px rgba(20,83,45,0.18); animation: sectionFlash 1.8s ease-in-out; }
@keyframes sectionFlash { 0% { box-shadow: 0 0 0 0 rgba(20,83,45,0), 0 0 0 rgba(20,83,45,0); } 35% { box-shadow: 0 0 0 7px rgba(20,83,45,0.10), 0 0 30px rgba(20,83,45,0.20); } 100% { box-shadow: 0 0 0 3px rgba(20,83,45,0.10), 0 0 25px rgba(20,83,45,0.14); } }

.topbar { height: 72px; background: #ffffff; border-bottom: 1px solid #eef1ec; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 32px; position: sticky; top: 0; z-index: 50; transition: background .2s ease, border-color .2s ease; }
.topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.topbar-right { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
.menu-toggle { display: none; width: 38px; height: 38px; border-radius: 10px; border: 1px solid #eef1ec; background: #f5faf6; color: #14532d; align-items: center; justify-content: center; padding: 9px; flex-shrink: 0; }
.theme-toggle { width: 38px; height: 38px; border-radius: 50%; border: 1px solid #eef1ec; background: #f5faf6; color: #14532d; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.theme-toggle svg { width: 18px; height: 18px; }
.theme-toggle:hover { background: #eaf3de; }
.logo { color: #14532d; font-size: 19px; line-height: .95; font-weight: 800; letter-spacing: .5px; white-space: nowrap; }
.logo span { display: block; }
.avatar { width: 38px; height: 38px; border-radius: 50%; background: #eaf3de; color: #14532d; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.profile-menu-wrapper { position: relative; }
.top-profile-button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 6px 10px; border-radius: 10px; }
.top-profile-button:hover { background: #f5faf6; }
.top-profile-info strong { font-size: 14px; color: #1f2d22; }
.profile-arrow { color: #8a948e; font-size: 12px; }
.profile-dropdown { position: absolute; top: calc(100% + 8px); right: 0; width: 190px; padding: 6px; background: #ffffff; border: 1px solid #e4e9e5; border-radius: 12px; box-shadow: 0 14px 35px rgba(20,55,35,.14); z-index: 999; }
.profile-dropdown button { width: 100%; display: flex; align-items: center; gap: 10px; border: 0; border-radius: 8px; background: transparent; padding: 10px 10px; font-size: 13px; font-weight: 600; color: #24332a; text-align: left; }
.profile-dropdown button:hover { background: #eef8f1; color: #14532d; }
.profile-dropdown .profile-logout { color: #b42318; }
.profile-dropdown .profile-logout:hover { background: #fff1f0; }
.dropdown-icon { width: 16px; height: 16px; }
.profile-dropdown-divider { height: 1px; background: #eef1ec; margin: 4px 4px; }

.layout { display: flex; align-items: flex-start; }
.sidebar { width: 220px; min-height: calc(100vh - 72px); background: #ffffff; border-right: 1px solid #eef1ec; padding: 20px 14px; position: sticky; top: 72px; flex-shrink: 0; }
.sidebar-drawer-head { display: none; }
.sidebar-backdrop { display: none; }
.main { flex: 1; min-width: 0; padding: 28px 32px; }
.sidebar-nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item { width: 100%; border: 0; background: transparent; border-radius: 10px; padding: 11px 12px; display: flex; align-items: center; gap: 12px; text-align: left; color: #5c6a60; font-size: 13.5px; font-weight: 500; }
.nav-icon { width: 19px; height: 19px; flex-shrink: 0; }
.nav-item:hover { background: #f4faf5; color: #14532d; }
.nav-item.active { background: #eaf3de; color: #14532d; font-weight: 700; }

.hero { background: #eef6e4; border-radius: 16px; overflow: hidden; margin-bottom: 18px; border: 1px solid #dcebc8; }
.hero-content { min-height: 200px; display: flex; align-items: center; justify-content: space-between; padding: 32px 36px; gap: 24px; }
.hero-text h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.2; color: #14532d; font-weight: 800; }
.hero-text p { margin: 0 0 18px; font-size: 14px; color: #4b5a4f; max-width: 420px; }
.hero-button { border: 0; border-radius: 8px; background: #14532d; color: #fff; padding: 12px 20px; font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; }
.hero-button:hover { background: #0d3b1f; }
.hero-visual { width: 220px; height: 160px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.hero-image { max-width: 100%; max-height: 100%; object-fit: contain; }

.alert { border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; font-size: 12px; font-weight: 700; }
.alert.success { background: #e7f8ec; border: 1px solid #bce5c7; color: #14532d; }
.alert.error { background: #fff0ef; border: 1px solid #f1c5c0; color: #b42318; }

.headline-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 18px; }

.tier-banner { background: linear-gradient(135deg,#f3f9e7 0%,#ffffff 72%); border: 1px solid #dcebc8; border-radius: 12px; padding: 16px 20px; margin-bottom: 18px; }
.tier-banner p { margin: 0; font-size: 13.5px; color: #1f2d22; line-height: 1.6; }
.tier-banner p strong { color: #14532d; }
.tier-banner-scale { margin-top: 8px !important; font-size: 11.5px !important; color: #6b7a70 !important; }
.tier-banner-scale strong { color: inherit !important; }

.kyc-banner { background: #fff8ec; border: 1px solid #f2ddb0; border-radius: 12px; padding: 18px 20px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.kyc-banner-left { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
.kyc-banner-icon { width: 42px; height: 42px; border-radius: 50%; background: #f3e2b3; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.kyc-banner h3 { margin: 0 0 4px; font-size: 15px; color: #7a5a10; }
.kyc-banner p { margin: 0; font-size: 13px; color: #8a6d2a; max-width: 480px; line-height: 1.5; }
.kyc-banner-button { display: inline-flex; align-items: center; gap: 8px; background: #14532d; color: #ffffff; padding: 12px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; text-decoration: none; white-space: nowrap; flex-shrink: 0; }
.kyc-pending-badge { background: #f3e2b3; color: #7a5a10; padding: 10px 16px; border-radius: 999px; font-weight: 700; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
.headline-stat { background: #ffffff; border: 1px solid #eef1ec; border-radius: 12px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; min-width: 0; }
.headline-stat > div { min-width: 0; }
.headline-stat-icon { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; padding: 10px; font-weight: 800; font-size: 15px; flex-shrink: 0; }
.icon-green { background: #eaf3de; color: #14532d; }
.icon-peach { background: #fbe9d6; color: #b96b1a; }
.headline-stat strong { display: block; font-size: 21px; color: #1f2d22; overflow-wrap: anywhere; }
.headline-stat span { display: block; margin-top: 2px; font-size: 12.5px; color: #6b7a70; }

.link-only-grid { display: grid; grid-template-columns: 1fr; gap: 14px; margin-bottom: 18px; }
.link-card, .code-card { background: #ffffff; border: 1px solid #eef1ec; border-radius: 12px; padding: 18px 20px; min-width: 0; }
.link-card-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: #14532d; }
.link-card-heading svg { width: 18px; height: 18px; }
.link-card-heading h3 { margin: 0; font-size: 14px; color: #1f2d22; }
.link-row { display: flex; gap: 8px; margin-bottom: 14px; }
.link-row input { flex: 1; min-width: 0; border: 1px solid #e4e9e5; border-radius: 8px; padding: 10px 12px; font-size: 12.5px; color: #5f6c64; background: #fbfcfb; }
.copy-btn { border: 0; border-radius: 8px; background: #14532d; color: #fff; padding: 0 16px; font-size: 12.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.copy-btn svg { width: 14px; height: 14px; }
.copy-btn.outline { background: #ffffff; color: #14532d; border: 1px solid #cfe0d3; }
.share-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.share-row span { font-size: 12px; color: #6b7a70; margin-right: 4px; }
.share-icon { width: 32px; height: 32px; border-radius: 50%; border: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #fff; flex-shrink: 0; }
.share-icon svg { width: 16px; height: 16px; }
.share-icon.whatsapp { background: #25d366; }
.share-icon.facebook { background: #1877f2; }
.share-icon.instagram { background: #c1387b; }
.code-row { display: flex; gap: 8px; margin-bottom: 8px; }
.code-value { flex: 1; border: 1px solid #e4e9e5; border-radius: 8px; padding: 10px 12px; font-size: 14px; font-weight: 800; letter-spacing: .5px; color: #1f2d22; background: #fbfcfb; }
.code-hint { margin: 0; font-size: 11.5px; color: #8a948e; }

.two-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.two-grid > * { min-width: 0; }
.panel { background: #ffffff; border: 1px solid #eef1ec; border-radius: 14px; padding: 20px; margin-bottom: 16px; min-width: 0; }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6px; }
.panel-heading h2 { margin: 4px 0 0; font-size: 16px; color: #18261e; }
.panel-description { color: #6b7a70; font-size: 12px; margin: 4px 0 0; }
.section-label { color: #14532d; font-size: 10px; font-weight: 800; letter-spacing: .6px; }

.referral-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.referrals-toggle { display: block; width: 100%; margin-top: 12px; padding: 10px; background: none; border: 1px solid #dce4df; border-radius: 8px; color: #14532d; font-size: 12px; font-weight: 700; cursor: pointer; }
.referrals-toggle:hover { background: #f5faf6; }
.dashboard[data-theme="dark"] .referrals-toggle { border-color: #26382f; color: #6fcf8f; }
.dashboard[data-theme="dark"] .referrals-toggle:hover { background: #1a2620; }
.referral-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.referral-table th { text-align: left; padding: 10px 12px; color: #6b7a70; font-weight: 600; border-bottom: 1px solid #eef1ec; white-space: nowrap; }
.referral-table td { padding: 12px; border-bottom: 1px solid #f3f5f2; color: #1f2d22; }
.status-pill { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.status-pill.placed { background: #eaf3de; color: #14532d; }
.status-pill.signed-up { background: #eef0fb; color: #4a4fb0; }

.payout-banner { background: #f4f9ee; border: 1px solid #dcebc8; border-radius: 14px; padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.payout-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.payout-round-icon { width: 46px; height: 46px; border-radius: 12px; background: #dff3e6; color: #14532d; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 800; flex-shrink: 0; }
.payout-banner h2 { margin: 4px 0 2px; color: #14532d; font-size: 22px; }
.payout-banner p { margin: 0; color: #6b7a70; font-size: 11px; }
.payout-action { display: flex; align-items: center; gap: 14px; }
.payout-action > p { font-size: 10px; }
.payout-note { font-size: 13px; color: #4b5a4f; font-weight: 600; margin: 0; }
.request-button { border: 0; border-radius: 8px; background: #14532d; color: #fff; padding: 11px 16px; font-weight: 700; font-size: 12px; }
.request-button:disabled { background: #b0bfb5; cursor: not-allowed; }

.earnings-total { margin-top: 10px; }
.earnings-total strong { display: block; font-size: 21px; color: #14532d; }
.earnings-total span { display: block; margin-top: 3px; font-size: 10px; color: #77827b; }

.earnings-period-tabs { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.earnings-period-tab { border: 1px solid #e4e9e5; background: #fbfcfb; color: #5f6c64; padding: 7px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.earnings-period-tab:hover { background: #f4f9ee; }
.earnings-period-tab.active { background: #14532d; border-color: #14532d; color: #ffffff; }

.earnings-period-value { margin-top: 16px; padding: 14px 16px; background: #f7faf7; border-radius: 10px; }
.earnings-period-value strong { display: block; font-size: 24px; color: #14532d; }
.earnings-period-value span { display: block; margin-top: 3px; font-size: 11px; color: #77827b; }
.chart { height: 220px; margin-top: 14px; }
.chart-grid { position: relative; height: 190px; margin-left: 40px; border-bottom: 1px solid #eef1ec; }
.grid-line { position: absolute; left: 0; right: 0; border-top: 1px dashed #eef1ec; }
.grid-line span { position: absolute; left: -42px; top: -7px; width: 38px; color: #8a948e; font-size: 9px; }
.grid-line.top { top: 0; }
.grid-line.middle { top: 50%; }
.grid-line.bottom { bottom: 0; border-top: 0; }
.bars { position: absolute; inset: 8px 4px 0 4px; display: flex; align-items: flex-end; justify-content: space-around; gap: 10px; }
.bar-column { position: relative; height: 100%; flex: 1; min-width: 20px; max-width: 60px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.earning-bar { width: min(28px, 70%); min-height: 4px; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, #3f9c5f, #14532d); }
.bar-value { position: absolute; bottom: calc(var(--bar-height, 0%) + 22px); display: none; color: #14532d; font-size: 9px; font-weight: 700; }
.bar-column:hover .bar-value { display: block; }
.bar-label { margin-top: 7px; color: #8a948e; font-size: 9px; white-space: nowrap; }

.commission-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
.commission-box { padding: 12px; border-radius: 10px; background: #f7faf7; min-width: 0; }
.commission-box span { display: block; color: #6b7a70; font-size: 9px; }
.commission-box strong { display: block; color: #14532d; font-size: 16px; margin-top: 4px; overflow-wrap: anywhere; }
.approved-box strong { color: #14532d; }
.paid-box strong { color: #2169b5; }
.order-summary { display: flex; gap: 10px; margin-top: 12px; }
.order-summary > div { flex: 1; min-width: 0; padding: 10px; border: 1px solid #eef1ec; border-radius: 9px; }
.order-summary span { display: block; color: #77827b; font-size: 9px; }
.order-summary strong { display: block; margin-top: 4px; font-size: 13px; overflow-wrap: anywhere; }

.share-row.wide { gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.share-row.wide .share { border: 0; border-radius: 8px; padding: 10px 16px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; }
.share-row.wide .share svg { width: 16px; height: 16px; flex-shrink: 0; }
.share-row.wide .whatsapp { background: #e5f7ea; color: #14532d; }
.share-row.wide .facebook { background: #e8f0ff; color: #2169b5; }
.share-row.wide .instagram { background: #fbe6f0; color: #c1387b; }

.payout-history-list { margin-top: 10px; }
.history-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f3f5f2; }
.history-row:last-child { border-bottom: 0; }
.history-icon { width: 36px; height: 36px; border-radius: 9px; background: #eaf3de; color: #14532d; display: flex; align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0; }
.history-info { flex: 1; min-width: 0; }
.history-info strong { display: block; font-size: 13px; }
.history-info span { display: block; margin-top: 2px; color: #8a948e; font-size: 9px; }
.history-status { padding: 5px 10px; border-radius: 20px; font-size: 9px; font-weight: 800; flex-shrink: 0; }
.history-status.pending { background: #fff1df; color: #b96b1a; }
.history-status.approved { background: #e7f1ff; color: #2169b5; }
.history-status.paid { background: #e5f7e9; color: #14532d; }
.history-status.cancelled { background: #f1f1f1; color: #777; }

.empty-state { text-align: center; padding: 30px 15px; color: #78847d; }
.empty-state strong { display: block; color: #35443b; font-size: 13px; }
.empty-state p { font-size: 11px; margin: 4px 0 0; }

.small-panel { background: #ffffff; border: 1px solid #eef1ec; border-radius: 14px; padding: 18px; display: flex; gap: 14px; align-items: center; margin-bottom: 16px; }
.small-panel > div { min-width: 0; }
.small-icon { width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; background: #eaf3de; color: #14532d; display: flex; align-items: center; justify-content: center; padding: 9px; }
.small-panel h3 { margin: 4px 0; font-size: 14px; }
.small-panel p { margin: 3px 0; color: #6b7a70; font-size: 11px; overflow-wrap: anywhere; }

.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 2000; max-width: calc(100% - 32px); background: #14532d; color: #ffffff; padding: 12px 18px; border-radius: 12px; font-size: 13px; font-weight: 600; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,.2); animation: toastIn .2s ease; }
@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
.dashboard[data-theme="dark"] .toast { background: #2f8f57; }

.footer { background: #ffffff; border-top: 1px solid #eef1ec; padding: 18px; text-align: center; color: #7b857f; font-size: 10px; }
.footer div { color: #14532d; font-weight: 800; letter-spacing: 1px; margin-bottom: 4px; }

/* =========================================================
   RESPONSIVE
========================================================= */

@media (max-width: 950px) {
  .sidebar { width: 190px; }
  .main { padding: 20px; }
  .two-grid { grid-template-columns: 1fr; }
  .headline-stats { grid-template-columns: repeat(2, 1fr); }
  .hero-visual { display: none; }
}

/* Tablet + phone: sidebar becomes a slide-in drawer */
@media (max-width: 768px) {
  .menu-toggle { display: flex; }

  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: 270px; max-width: 85vw; height: 100%; min-height: 0; overflow-y: auto; z-index: 300; padding: 16px 14px 24px; transform: translateX(-100%); transition: transform .25s ease; }
  .sidebar.open { transform: translateX(0); box-shadow: 8px 0 30px rgba(0,0,0,.18); }

  .sidebar-drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 16px; margin-bottom: 8px; border-bottom: 1px solid #eef1ec; }
  .sidebar-close { width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent; color: #5c6a60; padding: 8px; flex-shrink: 0; }

  .sidebar-backdrop { display: block; position: fixed; inset: 0; background: rgba(15,22,19,.45); z-index: 250; opacity: 0; pointer-events: none; transition: opacity .25s ease; }
  .sidebar-backdrop.open { opacity: 1; pointer-events: auto; }

  .nav-item { padding: 13px 12px; font-size: 14.5px; }
}

/* Phone */
@media (max-width: 600px) {
  .topbar { height: 62px; padding: 0 14px; gap: 10px; }
  .topbar-left { gap: 10px; }
  .topbar-right { gap: 8px; }
  .logo { font-size: 15px; }
  .top-profile-info, .profile-arrow { display: none; }
  .top-profile-button { padding: 2px; gap: 0; }
  section, .panel, .payout-banner, .small-panel { scroll-margin-top: 80px; }

  .main { padding: 14px; }
  .panel { padding: 16px; }
  .link-card { padding: 16px; }

  .hero-content { min-height: 0; padding: 22px 20px; }
  .hero-text h1 { font-size: 22px; }
  .hero-text p { font-size: 13.5px; }

  .headline-stats { gap: 10px; }
  .headline-stat { padding: 14px 12px; gap: 10px; }
  .headline-stat-icon { width: 36px; height: 36px; padding: 8px; font-size: 14px; }
  .headline-stat strong { font-size: 18px; }
  .headline-stat span { font-size: 12px; }

  .tier-banner { padding: 14px 16px; }
  .tier-banner p { font-size: 13px; }

  .kyc-banner { padding: 16px; }
  .kyc-banner-button, .kyc-pending-badge { width: 100%; justify-content: center; text-align: center; }

  .link-row { flex-direction: column; }
  .copy-btn { height: 40px; justify-content: center; }
  .share-row.wide .share { flex: 1 1 96px; justify-content: center; padding: 10px 12px; }

  .payout-banner { flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; }

  .commission-grid { grid-template-columns: 1fr; }
  .order-summary { flex-direction: column; }
}

/* =========================================================
   DARK MODE
========================================================= */

.dashboard[data-theme="dark"] { background: #0f1613; color: #e5efe8; }
.dashboard[data-theme="dark"] body { background: #0f1613; color: #e5efe8; }

.dashboard[data-theme="dark"] .topbar { background: #141d19; border-bottom-color: #22302a; }
.dashboard[data-theme="dark"] .logo { color: #6fcf8f; }
.dashboard[data-theme="dark"] .avatar { background: #1d2b24; color: #6fcf8f; }
.dashboard[data-theme="dark"] .top-profile-button:hover { background: #1a2620; }
.dashboard[data-theme="dark"] .top-profile-info strong { color: #e5efe8; }
.dashboard[data-theme="dark"] .profile-arrow { color: #8fa398; }
.dashboard[data-theme="dark"] .profile-dropdown { background: #141d19; border-color: #22302a; box-shadow: 0 14px 35px rgba(0,0,0,.4); }
.dashboard[data-theme="dark"] .profile-dropdown button { color: #d6e3da; }
.dashboard[data-theme="dark"] .profile-dropdown button:hover { background: #1a2620; color: #6fcf8f; }
.dashboard[data-theme="dark"] .profile-dropdown .profile-logout { color: #ef7a6d; }
.dashboard[data-theme="dark"] .profile-dropdown .profile-logout:hover { background: #2a1a19; }
.dashboard[data-theme="dark"] .profile-dropdown-divider { background: #22302a; }
.dashboard[data-theme="dark"] .theme-toggle { background: #1a2620; border-color: #22302a; color: #6fcf8f; }
.dashboard[data-theme="dark"] .theme-toggle:hover { background: #22302a; }
.dashboard[data-theme="dark"] .menu-toggle { background: #1a2620; border-color: #22302a; color: #6fcf8f; }

.dashboard[data-theme="dark"] .sidebar { background: #141d19; border-right-color: #22302a; }
.dashboard[data-theme="dark"] .sidebar-drawer-head { border-bottom-color: #22302a; }
.dashboard[data-theme="dark"] .sidebar-close { color: #9db2a5; }
.dashboard[data-theme="dark"] .nav-item { color: #9db2a5; }
.dashboard[data-theme="dark"] .nav-item:hover { background: #1a2620; color: #6fcf8f; }
.dashboard[data-theme="dark"] .nav-item.active { background: #1d2b24; color: #6fcf8f; }

.dashboard[data-theme="dark"] .main { background: #0f1613; }

.dashboard[data-theme="dark"] .hero { background: #1a2620; border-color: #26382f; }
.dashboard[data-theme="dark"] .hero-text h1 { color: #6fcf8f; }
.dashboard[data-theme="dark"] .hero-text p { color: #a9bcae; }
.dashboard[data-theme="dark"] .hero-button { background: #2f8f57; }
.dashboard[data-theme="dark"] .hero-button:hover { background: #257a48; }
.dashboard[data-theme="dark"] .tier-banner { background: #1a2620; border-color: #26382f; }
.dashboard[data-theme="dark"] .tier-banner p { color: #d6e3da; }
.dashboard[data-theme="dark"] .tier-banner p strong { color: #6fcf8f; }
.dashboard[data-theme="dark"] .tier-banner-scale { color: #8fa398 !important; }
.dashboard[data-theme="dark"] .kyc-banner { background: #2a2214; border-color: #4a3a1a; }
.dashboard[data-theme="dark"] .kyc-banner-icon { background: #3a2e18; }
.dashboard[data-theme="dark"] .kyc-banner h3 { color: #e0c97a; }
.dashboard[data-theme="dark"] .kyc-banner p { color: #c9b581; }
.dashboard[data-theme="dark"] .kyc-pending-badge { background: #3a2e18; color: #e0c97a; }

.dashboard[data-theme="dark"] .headline-stat { background: #141d19; border-color: #22302a; }
.dashboard[data-theme="dark"] .headline-stat strong { color: #e5efe8; }
.dashboard[data-theme="dark"] .headline-stat span { color: #8fa398; }
.dashboard[data-theme="dark"] .icon-green { background: #1d2b24; color: #6fcf8f; }
.dashboard[data-theme="dark"] .icon-peach { background: #33241a; color: #e2a35f; }

.dashboard[data-theme="dark"] .link-card,
.dashboard[data-theme="dark"] .code-card,
.dashboard[data-theme="dark"] .panel,
.dashboard[data-theme="dark"] .small-panel { background: #141d19; border-color: #22302a; }
.dashboard[data-theme="dark"] .link-card-heading { color: #6fcf8f; }
.dashboard[data-theme="dark"] .link-card-heading h3 { color: #e5efe8; }
.dashboard[data-theme="dark"] .link-row input { background: #0f1613; border-color: #22302a; color: #c4d3c9; }
.dashboard[data-theme="dark"] .copy-btn.outline { background: #141d19; color: #6fcf8f; border-color: #26382f; }
.dashboard[data-theme="dark"] .code-value { background: #0f1613; border-color: #22302a; color: #e5efe8; }
.dashboard[data-theme="dark"] .code-hint { color: #8fa398; }
.dashboard[data-theme="dark"] .share-row span { color: #8fa398; }

.dashboard[data-theme="dark"] .panel-heading h2 { color: #e5efe8; }
.dashboard[data-theme="dark"] .panel-description { color: #8fa398; }
.dashboard[data-theme="dark"] .section-label { color: #6fcf8f; }

.dashboard[data-theme="dark"] .referral-table th { color: #8fa398; border-bottom-color: #22302a; }
.dashboard[data-theme="dark"] .referral-table td { color: #d6e3da; border-bottom-color: #1c2822; }
.dashboard[data-theme="dark"] .status-pill.placed { background: #1d2b24; color: #6fcf8f; }
.dashboard[data-theme="dark"] .status-pill.signed-up { background: #1c2038; color: #8b90e0; }

.dashboard[data-theme="dark"] .payout-banner { background: #1a2620; border-color: #26382f; }
.dashboard[data-theme="dark"] .payout-round-icon { background: #1d2b24; color: #6fcf8f; }
.dashboard[data-theme="dark"] .payout-banner h2 { color: #6fcf8f; }
.dashboard[data-theme="dark"] .payout-banner p { color: #8fa398; }
.dashboard[data-theme="dark"] .payout-note { color: #a9bcae; }
.dashboard[data-theme="dark"] .request-button:disabled { background: #2a3a32; }

.dashboard[data-theme="dark"] .earnings-total strong { color: #6fcf8f; }
.dashboard[data-theme="dark"] .earnings-total span { color: #8fa398; }
.dashboard[data-theme="dark"] .earnings-period-tab { background: #0f1613; border-color: #22302a; color: #9db2a5; }
.dashboard[data-theme="dark"] .earnings-period-tab:hover { background: #1a2620; }
.dashboard[data-theme="dark"] .earnings-period-tab.active { background: #2f8f57; border-color: #2f8f57; color: #ffffff; }
.dashboard[data-theme="dark"] .earnings-period-value { background: #1a2620; }
.dashboard[data-theme="dark"] .earnings-period-value strong { color: #6fcf8f; }
.dashboard[data-theme="dark"] .earnings-period-value span { color: #8fa398; }
.dashboard[data-theme="dark"] .chart-grid { border-bottom-color: #22302a; }
.dashboard[data-theme="dark"] .grid-line { border-top-color: #1c2822; }
.dashboard[data-theme="dark"] .grid-line span { color: #6b7d72; }
.dashboard[data-theme="dark"] .bar-label { color: #6b7d72; }
.dashboard[data-theme="dark"] .bar-value { color: #6fcf8f; }

.dashboard[data-theme="dark"] .commission-box { background: #1a2620; }
.dashboard[data-theme="dark"] .commission-box span { color: #8fa398; }
.dashboard[data-theme="dark"] .commission-box strong { color: #6fcf8f; }
.dashboard[data-theme="dark"] .paid-box strong { color: #6fa3e0; }
.dashboard[data-theme="dark"] .order-summary > div { border-color: #22302a; }
.dashboard[data-theme="dark"] .order-summary span { color: #8fa398; }

.dashboard[data-theme="dark"] .share-row.wide .whatsapp { background: #16281c; color: #6fcf8f; }
.dashboard[data-theme="dark"] .share-row.wide .facebook { background: #16202e; color: #6fa3e0; }
.dashboard[data-theme="dark"] .share-row.wide .instagram { background: #2c1a24; color: #e07aa8; }

.dashboard[data-theme="dark"] .history-icon { background: #1d2b24; color: #6fcf8f; }
.dashboard[data-theme="dark"] .history-info span { color: #6b7d72; }
.dashboard[data-theme="dark"] .history-row { border-bottom-color: #1c2822; }
.dashboard[data-theme="dark"] .history-status.pending { background: #33241a; color: #e2a35f; }
.dashboard[data-theme="dark"] .history-status.approved { background: #16202e; color: #6fa3e0; }
.dashboard[data-theme="dark"] .history-status.paid { background: #16281c; color: #6fcf8f; }
.dashboard[data-theme="dark"] .history-status.cancelled { background: #26302b; color: #9db2a5; }

.dashboard[data-theme="dark"] .empty-state { color: #8fa398; }
.dashboard[data-theme="dark"] .empty-state strong { color: #c4d3c9; }

.dashboard[data-theme="dark"] .small-icon { background: #1d2b24; color: #6fcf8f; }
.dashboard[data-theme="dark"] .small-panel h3 { color: #e5efe8; }
.dashboard[data-theme="dark"] .small-panel p { color: #8fa398; }

.dashboard[data-theme="dark"] .footer { background: #141d19; border-top-color: #22302a; }
.dashboard[data-theme="dark"] .footer div { color: #6fcf8f; }
.dashboard[data-theme="dark"] .footer span { color: #6b7d72; }

.dashboard[data-theme="dark"] .alert.success { background: #16281c; border-color: #1d3a28; color: #6fcf8f; }
.dashboard[data-theme="dark"] .alert.error { background: #2a1a19; border-color: #3a201f; color: #ef7a6d; }
`;