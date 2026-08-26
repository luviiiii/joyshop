import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  useFetcher,
  useLoaderData,
} from "react-router";
import { useState, useEffect } from "react";
import SettingsModal from "./SettingsModal";

/* =========================================================
   LOADER
========================================================= */

export async function loader({ request }) {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);

  const referralCode =
    url.searchParams.get("ref") || "KARINERU-57WS06";

  const ambassador =
    await db.ambassador.findFirst({
      where: {
        referralCode,
      },
    });

  /* =======================================================
     FALLBACK DATA
  ======================================================= */

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
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        {
          id: "2",
          name: "Customer",
          email: "",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        {
          id: "3",
          name: "Customer",
          email: "",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        {
          id: "4",
          name: "Test Customer",
          email: "",
          status: "ACTIVE",
          joinedAt: new Date(),
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
    };
  }

  /* =======================================================
     REFERRALS
  ======================================================= */

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

  /* =======================================================
     COMMISSIONS
  ======================================================= */

  const commissions =
    await db.commission.findMany({
      where: {
        ambassadorId: ambassador.id,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  /* =======================================================
     CHART DATA
  ======================================================= */

  const groupedChartData = {};

  commissions.forEach((commission) => {
    const date = new Date(
      commission.createdAt
    );

    const key =
      date.toISOString().slice(0, 10);

    if (!groupedChartData[key]) {
      groupedChartData[key] = {
        label: `${date.getDate()} ${date.toLocaleString(
          "en-US",
          {
            month: "short",
          }
        )}`,

        value: 0,
      };
    }

    groupedChartData[key].value += Number(
      commission.commissionAmount || 0
    );
  });

  let chartData =
    Object.values(groupedChartData)
      .slice(-7)
      .map((item) => ({
        ...item,
        value: Number(
          item.value.toFixed(2)
        ),
      }));

  /* =======================================================
     FALLBACK GRAPH
  ======================================================= */

  if (!chartData.length) {
    chartData = [
      { label: "1 Aug", value: 50 },
      { label: "5 Aug", value: 90 },
      { label: "10 Aug", value: 50 },
      { label: "15 Aug", value: 90 },
      { label: "20 Aug", value: 50 },
      { label: "24 Aug", value: 90 },
    ];
  }

  /* =======================================================
     COMMISSION CALCULATIONS
  ======================================================= */

  const totalCommission =
    commissions.reduce(
      (total, commission) =>
        total +
        Number(
          commission.commissionAmount || 0
        ),
      0
    );

  const pendingCommission =
    commissions
      .filter(
        (commission) =>
          commission.status === "PENDING"
      )
      .reduce(
        (total, commission) =>
          total +
          Number(
            commission.commissionAmount || 0
          ),
        0
      );

  const approvedCommission =
    commissions
      .filter(
        (commission) =>
          commission.status === "APPROVED"
      )
      .reduce(
        (total, commission) =>
          total +
          Number(
            commission.commissionAmount || 0
          ),
        0
      );

  const paidCommission =
    commissions
      .filter(
        (commission) =>
          commission.status === "PAID"
      )
      .reduce(
        (total, commission) =>
          total +
          Number(
            commission.commissionAmount || 0
          ),
        0
      );

  /* =======================================================
     PAYOUTS
  ======================================================= */

  const payouts =
    await db.payout.findMany({
      where: {
        ambassadorId: ambassador.id,
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  const allocatedPayouts =
    payouts
      .filter(
        (payout) =>
          payout.status === "PENDING" ||
          payout.status === "APPROVED" ||
          payout.status === "PAID"
      )
      .reduce(
        (total, payout) =>
          total +
          Number(payout.amount || 0),
        0
      );

  /* =======================================================
     BALANCE
  ======================================================= */

  const availableBalance =
    Math.max(
      0,
      approvedCommission -
        allocatedPayouts
    );

  /* =======================================================
     SALES
  ======================================================= */

  const totalSales =
    commissions.reduce(
      (total, commission) =>
        total +
        Number(
          commission.orderAmount || 0
        ),
      0
    );

  /* =======================================================
     STATS
  ======================================================= */

  const stats = {
    referrals: referrals.length,
    orders: commissions.length,
    sales: totalSales,
    commission: totalCommission,
    pending: pendingCommission,
    approved: approvedCommission,
    paid: paidCommission,
    available: availableBalance,
  };

  return {
    ambassador: {
      id: ambassador.id,
      name: ambassador.name,
      email: ambassador.email,
      referralCode:
        ambassador.referralCode,
      status: ambassador.status,
    },

    stats,

    chartData,

    payouts:
      payouts.slice(0, 10).map(
        (payout) => ({
          id: payout.id,
          amount: Number(
            payout.amount || 0
          ),
          method: payout.method,
          status: payout.status,
          requestedAt:
            payout.requestedAt,
          processedAt:
            payout.processedAt,
        })
      ),

    referrals:
      referrals.map(
        (referral) => ({
          id: referral.id,

          name:
            referral.referredName ||
            referral.referredEmail ||
            "Customer",

          email:
            referral.referredEmail,

          status:
            referral.status ||
            "ACTIVE",

          joinedAt:
            referral.joinedAt ||
            referral.createdAt,
        })
      ),
  };
}

/* =========================================================
   ACTION
========================================================= */

export async function action({
  request,
}) {
  await authenticate.public.appProxy(
    request
  );

  const formData =
    await request.formData();

  const actionType =
    formData.get("action");

  const ambassadorId =
    formData.get("ambassadorId");

  const requestedAmount =
    Number(
      formData.get("amount") || 0
    );

  /* =======================================================
     REQUEST PAYOUT
  ======================================================= */

  if (
    actionType ===
    "request-payout"
  ) {
    if (!ambassadorId) {
      return {
        success: false,
        error:
          "Ambassador not found.",
      };
    }

    const ambassador =
      await db.ambassador.findUnique({
        where: {
          id: ambassadorId,
        },
      });

    if (!ambassador) {
      return {
        success: false,
        error:
          "Ambassador not found.",
      };
    }

    const commissions =
      await db.commission.findMany({
        where: {
          ambassadorId:
            ambassador.id,

          status: "APPROVED",
        },
      });

    const approvedCommission =
      commissions.reduce(
        (total, commission) =>
          total +
          Number(
            commission.commissionAmount ||
              0
          ),
        0
      );

    const payouts =
      await db.payout.findMany({
        where: {
          ambassadorId:
            ambassador.id,

          status: {
            in: [
              "PENDING",
              "APPROVED",
              "PAID",
            ],
          },
        },
      });

    const allocatedPayouts =
      payouts.reduce(
        (total, payout) =>
          total +
          Number(
            payout.amount || 0
          ),
        0
      );

    const availableBalance =
      Math.max(
        0,
        approvedCommission -
          allocatedPayouts
      );

    if (
      availableBalance <= 0
    ) {
      return {
        success: false,
        error:
          "You don't have any available balance for payout.",
      };
    }

    const amount =
      requestedAmount > 0
        ? requestedAmount
        : availableBalance;

    if (
      amount >
      availableBalance
    ) {
      return {
        success: false,
        error:
          `Maximum available payout is ₹${availableBalance.toFixed(
            2
          )}.`,
      };
    }

    const minimumPayout =
      100;

    if (
      amount <
      minimumPayout
    ) {
      return {
        success: false,
        error:
          `Minimum payout amount is ₹${minimumPayout}.`,
      };
    }

    const existingPendingPayout =
      await db.payout.findFirst({
        where: {
          ambassadorId:
            ambassador.id,

          status: {
            in: [
              "PENDING",
              "APPROVED",
            ],
          },
        },
      });

    if (
      existingPendingPayout
    ) {
      return {
        success: false,
        error:
          "You already have a payout request waiting for processing.",
      };
    }

    const payout =
      await db.payout.create({
        data: {
          shop:
            ambassador.shop,

          ambassadorId:
            ambassador.id,

          amount,

          method: "MANUAL",

          status: "PENDING",

          requestedAt:
            new Date(),
        },
      });

    return {
      success: true,

      message:
        "Your payout request has been submitted successfully.",

      payout: {
        id: payout.id,

        amount:
          Number(
            payout.amount
          ),

        status:
          payout.status,
      },
    };
  }

  return {
    success: false,
    error:
      "Invalid action.",
  };
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
  } = useLoaderData();

  const payoutFetcher =
    useFetcher();

  const [
    copied,
    setCopied,
  ] = useState(false);

  const [
    activeSection,
    setActiveSection,
  ] = useState(
    "dashboard"
  );

  const [
    showProfileMenu,
    setShowProfileMenu,
  ] = useState(false);

  const [
    showSettingsModal,
    setShowSettingsModal,
  ] = useState(false);

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

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showProfileMenu, showSettingsModal]);

  const referralLink =
      `https://justorganik.com/?ref=${ambassador.referralCode}`;

  const actionData =
    payoutFetcher.data;

  const isSubmitting =
    payoutFetcher.state ===
    "submitting";

  /* =======================================================
     MONEY
  ======================================================= */

  function money(value) {
    return `₹${Number(
      value || 0
    ).toFixed(2)}`;
  }

  /* =======================================================
     SIDEBAR NAVIGATION
  ======================================================= */

  function goToSection(
    sectionId
  ) {
    setActiveSection(
      sectionId
    );

    const element =
      document.getElementById(
        sectionId
      );

    if (!element) {
      console.log(
        "Section not found:",
        sectionId
      );

      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    element.classList.remove(
      "section-glow-flash"
    );

    void element.offsetWidth;

    element.classList.add(
      "section-glow-flash"
    );

    window.setTimeout(
      () => {
        element.classList.remove(
          "section-glow-flash"
        );
      },
      1800
    );
  }

  /* =======================================================
     COPY REFERRAL LINK
  ======================================================= */

async function copyReferralLink() {
  const text = referralLink;

  if (!text) {
    console.error("No referral link found");
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for non-secure contexts / older browsers
      const textarea = document.createElement("textarea");

      textarea.value = text;
      textarea.setAttribute("readonly", "");

      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "-9999px";
      textarea.style.width = "1px";
      textarea.style.height = "1px";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);

      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      const copiedSuccessfully =
        document.execCommand("copy");

      document.body.removeChild(textarea);

      if (!copiedSuccessfully) {
        throw new Error("Copy command failed");
      }
    }

    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);

  } catch (error) {
    console.error("Referral copy failed:", error);

    setCopied(false);
  }
}
  /* =======================================================
     SHARE
  ======================================================= */

  function shareWhatsApp() {
  const message =
    `Check out Just Organik and use my referral link:\n\n${referralLink}`;

  window.open(
    `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer"
  );
}

  function shareFacebook() {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function shareEmail() {
    const subject =
      "Check out Just Organik";

    const body =
      `Hi,\n\nI wanted to share Just Organik with you.\n\nUse my referral link:\n${referralLink}\n\nThanks!`;

    window.location.href =
      `mailto:?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(
        body
      )}`;
  }

  /* =======================================================
     INITIALS
  ======================================================= */

  const initials =
    ambassador.name
      ?.split(" ")
      .map(
        (word) => word[0]
      )
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    "AM";

  /* =======================================================
     GRAPH
  ======================================================= */

  const maximum =
    Math.max(
      ...chartData.map(
        (item) =>
          Number(
            item.value || 0
          )
      ),
      100
    );

  return (
    <div className="dashboard">

      {/* ===================================================
          TOP BAR
      =================================================== */}

      <header className="topbar">

  <div className="logo">
    JUST
    <span>ORGANIK</span>
  </div>

  <div className="profile-menu-wrapper">

    <button
      type="button"
      className="top-profile-button"
      aria-expanded={showProfileMenu}
      aria-haspopup="menu"
      onClick={() =>
        setShowProfileMenu((open) => !open)
      }
    >

      <div className="avatar">
        {initials}
      </div>

      <div className="top-profile-info">
        <strong>
          {ambassador.name}
        </strong>

        <small>
          Ambassador
        </small>
      </div>

      <span className="profile-arrow">
        {showProfileMenu ? "⌃" : "⌄"}
      </span>

    </button>

    {showProfileMenu && (
      <div
        className="profile-dropdown"
        role="menu"
      >

        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setShowProfileMenu(false);
            setShowSettingsModal(true);
          }}
        >
          <span className="dropdown-icon">
            ⚙
          </span>

          <span>
            Settings
          </span>
        </button>

        <div className="profile-dropdown-divider" />

        <button
          type="button"
          role="menuitem"
          className="profile-logout"
          onClick={() => {
            window.location.href =
              "/auth/login";
          }}
        >
          <span className="dropdown-icon">
            ↪
          </span>

          <span>
            Log out
          </span>
        </button>

      </div>
    )}

  </div>

</header>

      {/* ===================================================
          LAYOUT
      =================================================== */}

      <div className="layout">

        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="sidebar">

          <div className="profile-card">

            <div className="big-avatar">
              {initials}
            </div>

            <strong>
              {ambassador.name}
            </strong>

            <small>
              {ambassador.referralCode}
            </small>

            <span className="active-status">
              ● {ambassador.status}
            </span>

          </div>

          {/* =================================================
              IMPORTANT:
              These are REAL BUTTONS.
              They do not depend on React Router.
          ================================================= */}

          <nav className="sidebar-nav">

            
            <button
              type="button"
              onClick={() => {
                setShowProfileMenu(false);
                setShowSettingsModal(true);
              }}
              className="nav-item"
            >
              <span>⚙</span>
              Profile Settings
            </button>

            <button
              type="button"
              onClick={() =>
                goToSection(
                  "support"
                )
              }
              className={
                activeSection ===
                "support"
                  ? "nav-item active"
                  : "nav-item"
              }
            >
              <span>?</span>
              Support
            </button>

          </nav>

          {/* =================================================
              EARN MORE
          ================================================= */}

          <div className="sidebar-bottom">

            <div className="earn-more">

              <div className="earn-icon">
                🎁
              </div>

              <h4>
                Earn More!
              </h4>

              <p>
                Share your referral
                link and earn
                commission on
                every order.
              </p>

              <button
                type="button"
                onClick={
                  copyReferralLink
                }
              >
                {copied
                  ? "Link Copied!"
                  : "Copy Referral Link"}
              </button>

            </div>

            <button
              type="button"
              className="logout"
              onClick={() =>
                goToSection(
                  "dashboard"
                )
              }
            >
              ← Dashboard
            </button>

          </div>

        </aside>

        {/* =================================================
            MAIN
        ================================================= */}

        <main className="main">

          {/* =================================================
              DASHBOARD
          ================================================= */}

          <section
            id="dashboard"
            className={
              activeSection ===
              "dashboard"
                ? "hero section-glow"
                : "hero"
            }
          >

            <div className="hero-content">

              <div className="hero-text">

                <span className="hero-label">
                  AMBASSADOR DASHBOARD
                </span>

                <h1>
                  Welcome back,
                  <br />
                  {ambassador.name}!
                  👋
                </h1>

                <p>
                  Track your referrals,
                  orders, earnings and
                  payouts all in one place.
                </p>

                <div className="hero-actions">

                  <button
                    type="button"
                    className="hero-button primary"
                    onClick={() =>
                      goToSection(
                        "marketing"
                      )
                    }
                  >
                    Share Referral Link
                  </button>

                  <button
                    type="button"
                    className="hero-button secondary"
                    onClick={() =>
                      goToSection(
                        "payouts"
                      )
                    }
                  >
                    View Earnings
                  </button>

                </div>

              </div>

              <div className="hero-visual">

                <div className="hero-circle">
                  ₹
                </div>

                <div className="floating-card floating-one">

                  <span>
                    Commission
                  </span>

                  <strong>
                    {money(
                      stats.commission
                    )}
                  </strong>

                </div>

                <div className="floating-card floating-two">

                  <span>
                    Referrals
                  </span>

                  <strong>
                    {stats.referrals}
                  </strong>

                </div>

              </div>

            </div>

          </section>

          {/* =================================================
              ALERT
          ================================================= */}

          {actionData?.success &&
            actionData?.message && (
              <div className="alert success">
                ✓ {actionData.message}
              </div>
            )}

          {actionData?.error && (
            <div className="alert error">
              ! {actionData.error}
            </div>
          )}

          {/* =================================================
              STATS
          ================================================= */}

          <section className="stats-grid">

            <Stat
              icon="♟"
              title="Total Referrals"
              value={
                stats.referrals
              }
              color="green"
            />

            <Stat
              icon="🛒"
              title="Total Orders"
              value={
                stats.orders
              }
              color="blue"
            />

            <Stat
              icon="₹"
              title="Total Sales"
              value={money(
                stats.sales
              )}
              color="gold"
            />

            <Stat
              icon="▣"
              title="Total Commission"
              value={money(
                stats.commission
              )}
              color="purple"
            />

            <Stat
              icon="◷"
              title="Pending Commission"
              value={money(
                stats.pending
              )}
              color="orange"
            />

            <Stat
              icon="✓"
              title="Approved Commission"
              value={money(
                stats.approved
              )}
              color="green"
            />

            <Stat
              icon="◆"
              title="Paid Commission"
              value={money(
                stats.paid
              )}
              color="blue"
            />

            <Stat
              icon="₹"
              title="Available Balance"
              value={money(
                stats.available
              )}
              color="gold"
              highlight
            />

          </section>

          {/* =================================================
              PAYOUT BANNER
          ================================================= */}

          <section
            id="payouts"
            className={
              activeSection ===
              "payouts"
                ? "payout-banner section-glow"
                : "payout-banner"
            }
          >

            <div className="payout-left">

              <div className="payout-round-icon">
                ₹
              </div>

              <div>

                <span className="section-label">
                  AVAILABLE BALANCE
                </span>

                <h2>
                  {money(
                    stats.available
                  )}
                </h2>

                <p>
                  Your approved
                  commission is ready
                  for withdrawal.
                </p>

              </div>

            </div>

            <div className="payout-action">

              <p>
                Minimum payout: ₹100
              </p>

              <payoutFetcher.Form
                method="post"
              >

                <input
                  type="hidden"
                  name="action"
                  value="request-payout"
                />

                <input
                  type="hidden"
                  name="ambassadorId"
                  value={
                    ambassador.id ||
                    ""
                  }
                />

                <input
                  type="hidden"
                  name="amount"
                  value={
                    stats.available
                  }
                />

                <button
                  type="submit"
                  className="request-button"
                  disabled={
                    isSubmitting ||
                    stats.available <
                      100
                  }
                >
                  {isSubmitting
                    ? "Requesting..."
                    : "Request Payout →"}
                </button>

              </payoutFetcher.Form>

            </div>

          </section>

          {/* =================================================
              EARNINGS + REFERRALS
          ================================================= */}

          <div className="two-grid">

            {/* =================================================
                EARNINGS
            ================================================= */}

            <section className="panel">

              <div className="panel-heading">

                <div>

                  <span className="section-label">
                    EARNINGS
                  </span>

                  <h2>
                    Earnings Overview
                  </h2>

                  <p className="panel-description">
                    Your referral
                    commission
                  </p>

                </div>

                <select
                  className="period-select"
                  defaultValue="month"
                >
                  <option value="month">
                    This Month
                  </option>

                  <option value="year">
                    This Year
                  </option>
                </select>

              </div>

              <div className="earnings-total">

                <strong>
                  {money(
                    stats.commission
                  )}
                </strong>

                <span>
                  Total referral
                  commission
                </span>

              </div>

              {/* =================================================
                  REAL BAR GRAPH
              ================================================= */}

              <div className="chart">

                <div className="chart-grid">

                  <div className="grid-line top">
                    <span>
                      ₹{maximum}
                    </span>
                  </div>

                  <div className="grid-line middle">
                    <span>
                      ₹{Math.round(
                        maximum / 2
                      )}
                    </span>
                  </div>

                  <div className="grid-line bottom">
                    <span>
                      ₹0
                    </span>
                  </div>

                  <div className="bars">

                    {chartData.map(
                      (
                        item,
                        index
                      ) => {

                        const value =
                          Number(
                            item.value ||
                              0
                          );

                        const height =
                          Math.max(
                            5,
                            Math.min(
                              100,
                              (value /
                                maximum) *
                                100
                            )
                          );

                        return (
                          <div
                            className="bar-column"
                            key={`${item.label}-${index}`}
                          >

                            <div
                              className="bar-value"
                            >
                              {money(
                                value
                              )}
                            </div>

                            <div
                              className="earning-bar"
                              style={{
                                height:
                                  `${height}%`,
                              }}
                            />

                            <span className="bar-label">
                              {
                                item.label
                              }
                            </span>

                          </div>
                        );
                      }
                    )}

                  </div>

                </div>

              </div>

            </section>

            {/* =================================================
                REFERRALS
            ================================================= */}

            <section
              id="referrals"
              className={
                activeSection ===
                "referrals"
                  ? "panel section-glow"
                  : "panel"
              }
            >

              <div className="panel-heading">

                <div>

                  <span className="section-label">
                    REFERRALS
                  </span>

                  <h2>
                    Recent Referrals
                  </h2>

                  <p className="panel-description">
                    Customers connected
                    through your referral.
                  </p>

                </div>

                <button
                  type="button"
                  className="view-link-button"
                  onClick={() =>
                    goToSection(
                      "referrals"
                    )
                  }
                >
                  View all
                </button>

              </div>

              <div className="referral-list">

                {referrals.length ===
                0 ? (
                  <div className="empty-state">
                    <div>
                      👥
                    </div>

                    <strong>
                      No referrals yet
                    </strong>

                    <p>
                      Share your
                      referral link to
                      get started.
                    </p>
                  </div>
                ) : (
                  referrals
                    .slice(0, 5)
                    .map(
                      (
                        referral
                      ) => {

                        const initials =
                          referral.name
                            ?.split(
                              " "
                            )
                            .map(
                              (word) =>
                                word[0]
                            )
                            .join("")
                            .slice(
                              0,
                              2
                            )
                            .toUpperCase() ||
                          "CU";

                        return (
                          <div
                            className="referral-row"
                            key={
                              referral.id
                            }
                          >

                            <div className="customer-avatar">
                              {
                                initials
                              }
                            </div>

                            <div className="customer-info">

                              <strong>
                                {
                                  referral.name
                                }
                              </strong>

                              <span>
                                Joined{" "}
                                {formatDate(
                                  referral.joinedAt
                                )}
                              </span>

                            </div>

                            <span className="customer-status">
                              {
                                referral.status
                              }
                            </span>

                          </div>
                        );
                      }
                    )
                )}

              </div>

            </section>

          </div>

          {/* =================================================
              ORDERS & COMMISSIONS
          ================================================= */}

          <section
            id="orders"
            className={
              activeSection ===
              "orders"
                ? "panel section-glow"
                : "panel"
            }
          >

            <div className="panel-heading">

              <div>

                <span className="section-label">
                  ORDERS
                </span>

                <h2>
                  Orders & Commissions
                </h2>

                <p className="panel-description">
                  Summary of orders
                  generated through
                  your referral.
                </p>

              </div>

              <button
                type="button"
                className="view-link-button"
                onClick={() =>
                  goToSection(
                    "orders"
                  )
                }
              >
                View all
              </button>

            </div>

            <div className="commission-grid">

              <div className="commission-box">
                <span>
                  Total Commission
                </span>

                <strong>
                  {money(
                    stats.commission
                  )}
                </strong>

                <small>
                  All commissions
                </small>
              </div>

              <div className="commission-box pending-box">
                <span>
                  Pending
                </span>

                <strong>
                  {money(
                    stats.pending
                  )}
                </strong>

                <small>
                  Awaiting approval
                </small>
              </div>

              <div className="commission-box approved-box">
                <span>
                  Approved
                </span>

                <strong>
                  {money(
                    stats.approved
                  )}
                </strong>

                <small>
                  Ready for payout
                </small>
              </div>

              <div className="commission-box paid-box">
                <span>
                  Paid
                </span>

                <strong>
                  {money(
                    stats.paid
                  )}
                </strong>

                <small>
                  Already paid
                </small>
              </div>

            </div>

            <div className="order-summary">

              <div>
                <span>
                  Total Orders
                </span>

                <strong>
                  {stats.orders}
                </strong>
              </div>

              <div>
                <span>
                  Total Sales
                </span>

                <strong>
                  {money(
                    stats.sales
                  )}
                </strong>
              </div>

              <div>
                <span>
                  Commission Rate
                </span>

                <strong>
                  10%
                </strong>
              </div>

            </div>

          </section>

          {/* =================================================
              MARKETING
          ================================================= */}

          <section
            id="marketing"
            className={
              activeSection ===
              "marketing"
                ? "panel referral-panel section-glow"
                : "panel referral-panel"
            }
          >

            <div className="panel-heading">

              <div>

                <span className="section-label">
                  MARKETING TOOLS
                </span>

                <h2>
                  Your Referral Link
                </h2>

                <p className="panel-description">
                  Share this link
                  with your friends
                  and earn commission
                  on their orders.
                </p>

              </div>

            </div>

            <div className="referral-box">

              <input
                type="text"
                value={
                  referralLink
                }
                readOnly
                onFocus={(event) =>
                  event.target.select()
                }
              />

              <button
                type="button"
                onClick={copyReferralLink}
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>

            </div>

            <div className="share-row">

              <span>
                Share on
              </span>

              <div className="share-buttons">

                <button
                  type="button"
                  className="share whatsapp"
                  onClick={
                    shareWhatsApp
                  }
                >
                  WhatsApp
                </button>

                <button
                  type="button"
                  className="share facebook"
                  onClick={
                    shareFacebook
                  }
                >
                  Facebook
                </button>

                <button
                  type="button"
                  className="share email"
                  onClick={
                    shareEmail
                  }
                >
                  Email
                </button>

              </div>

            </div>

          </section>

          {/* =================================================
              PAYOUT HISTORY
          ================================================= */}

          <section className="panel payout-history">

            <div className="panel-heading">

              <div>

                <span className="section-label">
                  PAYOUTS
                </span>

                <h2>
                  Payout History
                </h2>

              </div>

              <button
                type="button"
                className="view-link-button"
                onClick={() =>
                  goToSection(
                    "payouts"
                  )
                }
              >
                View payouts
              </button>

            </div>

            <div className="payout-history-list">

              {payouts.length ===
              0 ? (
                <div className="empty-state">
                  <div>
                    💰
                  </div>

                  <strong>
                    No payout requests
                  </strong>

                  <p>
                    Your payout history
                    will appear here.
                  </p>
                </div>
              ) : (
                payouts.map(
                  (payout) => (
                    <div
                      className="history-row"
                      key={
                        payout.id
                      }
                    >

                      <div className="history-icon">
                        ₹
                      </div>

                      <div className="history-info">

                        <strong>
                          {money(
                            payout.amount
                          )}
                        </strong>

                        <span>
                          {formatDate(
                            payout.requestedAt
                          )}
                        </span>

                      </div>

                      <span
                        className={`history-status ${String(
                          payout.status ||
                            ""
                        ).toLowerCase()}`}
                      >
                        {
                          payout.status
                        }
                      </span>

                    </div>
                  )
                )
              )}

            </div>

          </section>

          {/* =================================================
              PROFILE
          ================================================= */}

          <section
            id="profile"
            className={
              activeSection ===
              "profile"
                ? "small-panel section-glow"
                : "small-panel"
            }
          >

            <div className="small-icon">
              ⚙
            </div>

            <div>

              <span className="section-label">
                PROFILE SETTINGS
              </span>

              <h3>
                {ambassador.name}
              </h3>

              <p>
                Referral Code:{" "}
                {ambassador.referralCode}
              </p>

              <p>
                {ambassador.email ||
                  "Email not available"}
              </p>

            </div>

          </section>

          {/* =================================================
              SUPPORT
          ================================================= */}

          <section
            id="support"
            className={
              activeSection ===
              "support"
                ? "small-panel section-glow"
                : "small-panel"
            }
          >

            <div className="small-icon">
              ?
            </div>

            <div>

              <span className="section-label">
                NEED HELP?
              </span>

              <h3>
                Ambassador Support
              </h3>

              <p>
                Contact the Just
                Organik team if you
                need assistance.
              </p>

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
      />

      <footer className="footer">

        <div>
          JUST ORGANIK
        </div>

        <span>
          © 2026 Just Organik.
          All rights reserved.
        </span>

      </footer>

      <style>
        {styles}
      </style>

    </div>
  );
}

/* =========================================================
   STAT COMPONENT
========================================================= */

function Stat({
  icon,
  title,
  value,
  color = "green",
  highlight = false,
}) {
  return (
    <div
      className={`stat-card ${color} ${
        highlight
          ? "highlight"
          : ""
      }`}
    >

      <div className="stat-top">

        <div className="stat-icon">
          {icon}
        </div>

        {highlight && (
          <span className="available-tag">
            AVAILABLE
          </span>
        )}

      </div>

      <span className="stat-title">
        {title}
      </span>

      <strong className="stat-value">
        {value}
      </strong>

    </div>
  );
}

/* =========================================================
   DATE
========================================================= */

function formatDate(value) {
  if (!value) {
    return "Recently";
  }

  try {
    return new Date(
      value
    ).toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  } catch {
    return "Recently";
  }
}

/* =========================================================
   STYLES
========================================================= */

const styles = `

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: #f5faf7;
  color: #17251d;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Arial,
    sans-serif;
}

button,
input,
select {
  font: inherit;
}

button {
  cursor: pointer;
}

section,
.panel,
.payout-banner,
.small-panel {
  scroll-margin-top: 95px;
}

/* =========================================================
   GLOW
========================================================= */

.section-glow {
  border-color: #63c786 !important;

  box-shadow:
    0 0 0 2px
      rgba(8, 120, 59, 0.10),
    0 12px 35px
      rgba(8, 120, 59, 0.14);

  transition:
    box-shadow .25s ease,
    border-color .25s ease;
}

.section-glow-flash {
  border-color: #42b96b !important;

  box-shadow:
    0 0 0 4px
      rgba(8, 120, 59, 0.15),
    0 0 35px
      rgba(8, 120, 59, 0.22),
    0 14px 40px
      rgba(8, 120, 59, 0.14);

  animation:
    sectionFlash 1.8s ease-in-out;
}

@keyframes sectionFlash {

  0% {
    box-shadow:
      0 0 0 0
        rgba(8, 120, 59, 0),
      0 0 0
        rgba(8, 120, 59, 0);
  }

  35% {
    box-shadow:
      0 0 0 7px
        rgba(8, 120, 59, 0.12),
      0 0 35px
        rgba(8, 120, 59, 0.25);
  }

  100% {
    box-shadow:
      0 0 0 3px
        rgba(8, 120, 59, 0.12),
      0 0 30px
        rgba(8, 120, 59, 0.16);
  }
}

/* =========================================================
   TOP BAR
========================================================= */

.topbar {
  height: 76px;
  background: white;
  border-bottom: 1px solid #e3e9e5;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 0 38px;

  position: sticky;
  top: 0;
  z-index: 50;
}

.logo {
  color: #08783b;
  font-size: 21px;
  line-height: .9;
  font-weight: 900;
  letter-spacing: 1px;
}

.logo span {
  display: block;
}

.top-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar,
.big-avatar {
  background: #e0f3e6;
  color: #08783b;

  border-radius: 50%;

  display: flex;
  align-items: center;
  justify-content: center;

  font-weight: 800;
}

.avatar {
  width: 42px;
  height: 42px;
}

.top-profile-info strong {
  display: block;
  font-size: 13px;
}

.top-profile-info small {
  display: block;
  color: #7b867f;
  margin-top: 3px;
}

/* =========================================================
   PROFILE DROPDOWN
========================================================= */

.profile-chevron {
  color: #6f7c74;
  font-size: 9px;
  margin-left: 2px;
  transition: transform .2s ease;
}

.profile-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;

  width: 190px;

  padding: 7px;

  background: #ffffff;

  border: 1px solid #dfe9e2;
  border-radius: 13px;

  box-shadow:
    0 14px 35px
      rgba(20, 55, 35, .15);

  z-index: 9999;
}

.profile-dropdown button {
  width: 100%;

  display: flex;
  align-items: center;

  gap: 11px;

  border: 0;
  border-radius: 9px;

  background: transparent;

  padding: 11px 12px;

  color: #24332a;

  font-size: 12px;
  font-weight: 700;

  text-align: left;

  transition:
    background .18s ease,
    color .18s ease;
}

.profile-dropdown button:hover {
  background: #eef8f1;
  color: #08783b;
}

.profile-dropdown .profile-logout {
  color: #b42318;
}

.profile-dropdown .profile-logout:hover {
  background: #fff1f0;
  color: #c62828;
}

.dropdown-icon {
  width: 20px;
  text-align: center;
  font-size: 15px;
}

.profile-dropdown-divider {
  height: 1px;

  background: #e9eee9;

  margin: 4px 3px;
}

/* =========================================================
   LAYOUT
========================================================= */

.layout {
  display: flex;
  align-items: flex-start;
}

.sidebar {
  width: 275px;
  min-height: calc(100vh - 76px);

  background: white;
  border-right: 1px solid #e3e9e5;

  padding: 25px 18px;

  position: sticky;
  top: 76px;

  align-self: flex-start;
  flex-shrink: 0;
}

.main {
  flex: 1;
  min-width: 0;
  padding: 32px;
}

/* =========================================================
   PROFILE CARD
========================================================= */

.profile-card {
  border: 1px solid #e1e8e3;
  border-radius: 15px;

  padding: 20px 14px;

  text-align: center;

  margin-bottom: 20px;
}

.big-avatar {
  width: 76px;
  height: 76px;
  margin: 0 auto 12px;

  font-size: 25px;
}

.profile-card strong {
  display: block;
  font-size: 16px;
}

.profile-card small {
  display: block;
  margin-top: 5px;
  color: #7a867e;
  font-size: 11px;
}

.active-status {
  display: inline-block;

  margin-top: 10px;

  padding: 5px 12px;

  border-radius: 20px;

  background: #e3f7e9;
  color: #08783b;

  font-size: 10px;
  font-weight: 800;
}

/* =========================================================
   SIDEBAR NAV
========================================================= */

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  width: 100%;

  border: 0;

  background: transparent;

  border-radius: 11px;

  padding: 13px 15px;

  display: flex;
  align-items: center;

  gap: 13px;

  text-align: left;

  color: #526058;

  font-size: 13px;
  font-weight: 500;

  transition:
    background .2s ease,
    color .2s ease,
    box-shadow .2s ease,
    transform .2s ease;
}

.nav-item span {
  width: 20px;
  text-align: center;
  font-size: 15px;
}

.nav-item:hover {
  background: #f0f8f3;
  color: #08783b;
  transform: translateX(2px);
}

.nav-item.active {
  background: #e1f3e7;
  color: #08783b;

  font-weight: 800;

  box-shadow:
    inset 4px 0 0 #08783b,
    0 5px 15px
      rgba(8, 120, 59, 0.08);
}

/* =========================================================
   SIDEBAR BOTTOM
========================================================= */

.sidebar-bottom {
  margin-top: 25px;
}

.earn-more {
  background: #effaf3;

  border: 1px solid #d2ead9;

  border-radius: 14px;

  padding: 17px;
}

.earn-icon {
  font-size: 23px;
}

.earn-more h4 {
  margin: 8px 0 5px;
  font-size: 14px;
}

.earn-more p {
  margin: 0 0 14px;

  color: #66736c;

  font-size: 11px;
  line-height: 1.5;
}

.earn-more button {
  width: 100%;

  border: 0;

  background: #08783b;
  color: white;

  border-radius: 8px;

  padding: 10px;

  font-size: 11px;
  font-weight: 700;
}

.earn-more button:hover {
  background: #066c35;
}

.logout {
  margin-top: 18px;

  background: transparent;
  border: 0;

  color: #65716a;

  font-size: 12px;

  padding: 5px;
}

/* =========================================================
   HERO
========================================================= */

.hero {
  background:
    linear-gradient(
      120deg,
      #08783b,
      #15964e
    );

  color: white;

  border-radius: 20px;

  overflow: hidden;

  margin-bottom: 20px;

  box-shadow:
    0 15px 40px
      rgba(8, 120, 59, 0.15);
}

.hero-content {
  min-height: 300px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  padding: 40px 46px;
}

.hero-text {
  max-width: 650px;
}

.hero-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.4px;
  opacity: .85;
}

.hero h1 {
  margin: 14px 0 10px;

  font-size: 42px;
  line-height: 1.08;
}

.hero p {
  margin: 0;

  font-size: 14px;
  line-height: 1.5;

  opacity: .92;
}

.hero-actions {
  margin-top: 24px;

  display: flex;
  gap: 10px;
}

.hero-button {
  border-radius: 9px;

  padding: 12px 18px;

  font-weight: 700;
  font-size: 12px;
}

.hero-button.primary {
  border: 0;
  background: white;
  color: #08783b;
}

.hero-button.secondary {
  border: 1px solid
    rgba(255,255,255,.35);

  background:
    rgba(255,255,255,.12);

  color: white;
}

.hero-visual {
  width: 300px;
  height: 230px;

  position: relative;
  flex-shrink: 0;
}

.hero-circle {
  position: absolute;

  width: 170px;
  height: 170px;

  right: 55px;
  top: 30px;

  border-radius: 50%;

  background:
    rgba(255,255,255,.10);

  border:
    1px solid
      rgba(255,255,255,.18);

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 75px;
  font-weight: 800;
}

.floating-card {
  position: absolute;

  background: white;
  color: #17251d;

  padding: 12px 15px;

  border-radius: 12px;

  box-shadow:
    0 12px 30px
      rgba(0,0,0,.12);
}

.floating-card span {
  display: block;

  font-size: 9px;
  color: #7a867e;
}

.floating-card strong {
  display: block;

  color: #08783b;

  font-size: 17px;

  margin-top: 4px;
}

.floating-one {
  left: 0;
  top: 15px;
}

.floating-two {
  right: 0;
  bottom: 15px;
}

/* =========================================================
   ALERT
========================================================= */

.alert {
  border-radius: 10px;

  padding: 13px 16px;

  margin-bottom: 17px;

  font-size: 12px;
  font-weight: 700;
}

.alert.success {
  background: #e7f8ec;
  border: 1px solid #bce5c7;
  color: #08783b;
}

.alert.error {
  background: #fff0ef;
  border: 1px solid #f1c5c0;
  color: #b42318;
}

/* =========================================================
   STATS
========================================================= */

.stats-grid {
  display: grid;

  grid-template-columns:
    repeat(4, 1fr);

  gap: 14px;

  margin-bottom: 20px;
}

.stat-card {
  background: white;

  border: 1px solid #e3ebe5;

  border-radius: 14px;

  padding: 17px;

  min-height: 125px;

  transition: .2s;
}

.stat-card:hover {
  transform:
    translateY(-2px);

  box-shadow:
    0 8px 25px
      rgba(25,60,38,.06);
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stat-icon {
  width: 40px;
  height: 40px;

  border-radius: 11px;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 15px;
  font-weight: 800;
}

.stat-card.green
.stat-icon {
  background: #e4f6e9;
  color: #08783b;
}

.stat-card.blue
.stat-icon {
  background: #e8f1ff;
  color: #2169b5;
}

.stat-card.gold
.stat-icon {
  background: #fff5dc;
  color: #c88a00;
}

.stat-card.purple
.stat-icon {
  background: #f0eaff;
  color: #7252b8;
}

.stat-card.orange
.stat-icon {
  background: #fff0df;
  color: #d97706;
}

.stat-title {
  display: block;

  margin-top: 12px;

  color: #758179;

  font-size: 11px;
}

.stat-value {
  display: block;

  margin-top: 4px;

  font-size: 21px;

  color: #16251c;
}

.available-tag {
  background: #e3f7e8;

  color: #08783b;

  font-size: 8px;

  font-weight: 800;

  padding: 5px 7px;

  border-radius: 20px;
}

.stat-card.highlight {
  border-color: #a8dcb7;

  background:
    linear-gradient(
      145deg,
      #f6fcf7,
      #ffffff
    );
}

/* =========================================================
   PAYOUT BANNER
========================================================= */

.payout-banner {
  background:
    linear-gradient(
      110deg,
      #f2fbf4,
      #ffffff
    );

  border: 1px solid #b9dfc5;

  border-radius: 16px;

  padding: 19px 23px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  margin-bottom: 20px;
}

.payout-left {
  display: flex;
  align-items: center;

  gap: 14px;
}

.payout-round-icon {
  width: 51px;
  height: 51px;

  border-radius: 14px;

  background: #dff3e6;
  color: #08783b;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 22px;
  font-weight: 800;
}

.section-label {
  color: #08783b;

  font-size: 10px;
  font-weight: 800;

  letter-spacing: .7px;
}

.payout-banner h2 {
  margin: 5px 0 2px;

  color: #08783b;

  font-size: 25px;
}

.payout-banner p {
  margin: 0;

  color: #718078;

  font-size: 11px;
}

.payout-action {
  display: flex;
  align-items: center;

  gap: 15px;
}

.payout-action > p {
  font-size: 10px;
}

.request-button {
  border: 0;

  border-radius: 9px;

  background: #08783b;
  color: white;

  padding: 12px 17px;

  font-weight: 700;
  font-size: 12px;
}

.request-button:hover {
  background: #066c35;
}

.request-button:disabled {
  background: #aebbb2;
  cursor: not-allowed;
}

/* =========================================================
   PANELS
========================================================= */

.two-grid {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 18px;

  margin-bottom: 18px;
}

.panel {
  background: white;

  border: 1px solid #e4ebe6;

  border-radius: 16px;

  padding: 22px;

  margin-bottom: 18px;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  gap: 15px;
}

.panel-heading h2 {
  margin: 5px 0 0;

  font-size: 18px;

  color: #18261e;
}

.panel-description {
  color: #6f7c74;

  font-size: 12px;

  line-height: 1.5;

  margin: 5px 0 0;
}

.view-link-button {
  border: 0;

  background: transparent;

  color: #08783b;

  font-size: 11px;

  font-weight: 800;

  padding: 5px;
}

/* =========================================================
   EARNINGS
========================================================= */

.period-select {
  border: 1px solid #d6dfd8;

  border-radius: 8px;

  background: white;

  padding: 8px 10px;

  font-size: 11px;

  color: #56635c;
}

.earnings-total {
  margin-top: 15px;
}

.earnings-total strong {
  display: block;

  font-size: 23px;

  color: #08783b;
}

.earnings-total span {
  display: block;

  margin-top: 3px;

  font-size: 10px;

  color: #77827b;
}

/* =========================================================
   BAR GRAPH
========================================================= */

.chart {
  height: 245px;

  margin-top: 15px;
}

.chart-grid {
  position: relative;

  height: 205px;

  margin-left: 45px;

  border-bottom:
    1px solid #dfe7e1;
}

.grid-line {
  position: absolute;

  left: 0;
  right: 0;

  border-top:
    1px dashed #e5ebe7;
}

.grid-line span {
  position: absolute;

  left: -45px;
  top: -7px;

  width: 40px;

  color: #8a948e;

  font-size: 9px;
}

.grid-line.top {
  top: 0;
}

.grid-line.middle {
  top: 50%;
}

.grid-line.bottom {
  bottom: 0;

  border-top: 0;
}

.bars {
  position: absolute;

  inset: 8px 4px 0 4px;

  display: flex;

  align-items: flex-end;

  justify-content: space-around;

  gap: 12px;
}

.bar-column {
  position: relative;

  height: 100%;

  flex: 1;

  min-width: 24px;

  max-width: 70px;

  display: flex;

  flex-direction: column;

  align-items: center;

  justify-content: flex-end;
}

.earning-bar {
  width: min(34px, 70%);

  min-height: 4px;

  border-radius:
    8px 8px 2px 2px;

  background:
    linear-gradient(
      180deg,
      #13a054,
      #08783b
    );

  transition:
    height .35s ease,
    transform .2s ease;
}

.bar-column:hover
.earning-bar {
  transform:
    translateY(-3px);
}

.bar-value {
  position: absolute;

  bottom:
    calc(
      var(--bar-height, 0%)
      + 24px
    );

  display: none;

  color: #08783b;

  font-size: 9px;

  font-weight: 700;
}

.bar-column:hover
.bar-value {
  display: block;
}

.bar-label {
  margin-top: 8px;

  color: #8a948e;

  font-size: 9px;

  white-space: nowrap;
}

/* =========================================================
   REFERRALS
========================================================= */

.referral-list {
  margin-top: 12px;
}

.referral-row {
  display: flex;

  align-items: center;

  gap: 11px;

  padding: 12px 0;

  border-bottom:
    1px solid #edf1ee;
}

.referral-row:last-child {
  border-bottom: 0;
}

.customer-avatar {
  width: 39px;
  height: 39px;

  flex-shrink: 0;

  border-radius: 50%;

  background: #e5f5e9;
  color: #08783b;

  display: flex;
  align-items: center;
  justify-content: center;

  font-weight: 800;

  font-size: 13px;
}

.customer-info {
  flex: 1;
}

.customer-info strong {
  display: block;

  font-size: 12px;
}

.customer-info span {
  display: block;

  margin-top: 4px;

  color: #818c85;

  font-size: 10px;
}

.customer-status {
  background: #e5f7e9;

  color: #168342;

  padding: 5px 9px;

  border-radius: 20px;

  font-size: 9px;

  font-weight: 800;
}

/* =========================================================
   COMMISSION
========================================================= */

.commission-grid {
  display: grid;

  grid-template-columns:
    repeat(4, 1fr);

  gap: 10px;

  margin-top: 16px;
}

.commission-box {
  padding: 13px;

  border-radius: 10px;

  background: #f7faf7;
}

.commission-box span {
  display: block;

  color: #718078;

  font-size: 9px;
}

.commission-box strong {
  display: block;

  color: #08783b;

  font-size: 18px;

  margin-top: 5px;
}

.commission-box small {
  display: block;

  margin-top: 3px;

  color: #89938d;

  font-size: 8px;
}

.pending-box strong {
  color: #d97706;
}

.approved-box strong {
  color: #08783b;
}

.paid-box strong {
  color: #2169b5;
}

.order-summary {
  display: flex;

  gap: 10px;

  margin-top: 12px;
}

.order-summary > div {
  flex: 1;

  padding: 11px;

  border:
    1px solid #e7ece8;

  border-radius: 9px;
}

.order-summary span {
  display: block;

  color: #77827b;

  font-size: 9px;
}

.order-summary strong {
  display: block;

  margin-top: 4px;

  font-size: 14px;
}

/* =========================================================
   REFERRAL LINK
========================================================= */

.referral-box {
  margin-top: 18px;

  border:
    1px solid #d2ddd5;

  border-radius: 9px;

  overflow: hidden;

  display: flex;
}

.referral-box input {
  flex: 1;

  min-width: 0;

  border: 0;

  outline: none;

  padding: 12px;

  color: #5f6c64;

  font-size: 11px;

  background: #fbfcfb;
}

.referral-box button {
  border: 0;

  background: #08783b;

  color: white;

  padding: 0 19px;

  font-weight: 700;

  font-size: 11px;
}

.referral-box button:hover {
  background: #066c35;
}

.share-row {
  margin-top: 17px;
}

.share-row > span {
  color: #758078;

  font-size: 11px;
}

.share-buttons {
  display: flex;

  gap: 7px;

  margin-top: 8px;
}

.share {
  border: 0;

  border-radius: 7px;

  padding: 8px 11px;

  font-size: 10px;

  font-weight: 700;

  transition: .2s;
}

.share.whatsapp {
  background: #e5f7ea;
  color: #08783b;
}

.share.facebook {
  background: #e8f0ff;
  color: #2169b5;
}

.share.email {
  background: #f0eafa;
  color: #7252b8;
}

.share:hover {
  transform:
    translateY(-1px);
}

/* =========================================================
   PAYOUT HISTORY
========================================================= */

.payout-history-list {
  margin-top: 12px;
}

.history-row {
  display: flex;

  align-items: center;

  gap: 12px;

  padding: 13px 0;

  border-bottom:
    1px solid #edf1ee;
}

.history-row:last-child {
  border-bottom: 0;
}

.history-icon {
  width: 39px;
  height: 39px;

  border-radius: 10px;

  background: #e5f5e9;
  color: #08783b;

  display: flex;
  align-items: center;
  justify-content: center;

  font-weight: 800;
}

.history-info {
  flex: 1;
}

.history-info strong {
  display: block;

  font-size: 13px;
}

.history-info span {
  display: block;

  margin-top: 3px;

  color: #89938d;

  font-size: 9px;
}

.history-status {
  padding: 6px 10px;

  border-radius: 20px;

  font-size: 9px;

  font-weight: 800;
}

.history-status.pending {
  background: #fff1df;
  color: #d97706;
}

.history-status.approved {
  background: #e7f1ff;
  color: #2169b5;
}

.history-status.paid {
  background: #e5f7e9;
  color: #168342;
}

.history-status.cancelled {
  background: #f1f1f1;
  color: #777;
}

/* =========================================================
   EMPTY
========================================================= */

.empty-state {
  text-align: center;

  padding: 35px 15px;

  color: #78847d;
}

.empty-state > div {
  font-size: 30px;

  margin-bottom: 10px;
}

.empty-state strong {
  display: block;

  color: #35443b;

  font-size: 13px;
}

.empty-state p {
  font-size: 11px;
}

/* =========================================================
   SMALL PANELS
========================================================= */

.small-panel {
  background: white;

  border: 1px solid #e4ebe6;

  border-radius: 15px;

  padding: 20px;

  display: flex;

  gap: 14px;

  align-items: center;

  margin-bottom: 18px;
}

.small-icon {
  width: 45px;
  height: 45px;

  flex-shrink: 0;

  border-radius: 12px;

  background: #e5f5e9;

  color: #08783b;

  display: flex;

  align-items: center;
  justify-content: center;

  font-weight: 800;
}

.small-panel h3 {
  margin: 4px 0;

  font-size: 14px;
}

.small-panel p {
  margin: 3px 0;

  color: #758078;

  font-size: 10px;
}

/* =========================================================
   SETTINGS POPUP
========================================================= */

.settings-modal-overlay {
  position: fixed;
  z-index: 9999999;
  inset: 0;

  background:
    rgba(12, 27, 18, .42);

  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);

  display: flex;
  align-items: center;
  justify-content: center;

  padding: 24px;

  z-index: 200000;

  animation:
    settingsOverlayIn .18s ease-out;
}

@keyframes settingsOverlayIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.settings-modal {
  width: min(620px, 100%);

  max-height: min(720px, calc(100vh - 48px));

  overflow: auto;

  background: #ffffff;

  border:
    1px solid #dfe9e2;

  border-radius: 20px;

  box-shadow:
    0 25px 80px
      rgba(15, 40, 25, .25);

  animation:
    settingsModalIn .2s ease-out;
}

@keyframes settingsModalIn {
  from {
    opacity: 0;
    transform:
      translateY(12px)
      scale(.98);
  }

  to {
    opacity: 1;
    transform:
      translateY(0)
      scale(1);
  }
}

.settings-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;

  gap: 20px;

  padding: 25px 27px 20px;

  border-bottom:
    1px solid #edf1ee;
}

.settings-modal-header h2 {
  margin: 5px 0 0;

  color: #18261e;

  font-family:
    Georgia,
    "Times New Roman",
    serif;

  font-size: 25px;
}

.settings-modal-header p {
  margin: 6px 0 0;

  color: #77827b;

  font-size: 11px;

  line-height: 1.5;
}

.settings-close-button {
  width: 36px;
  height: 36px;

  flex: 0 0 36px;

  border: 1px solid #e3eae5;

  border-radius: 10px;

  background: #f8faf8;

  color: #59665e;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 23px;
  line-height: 1;

  cursor: pointer;

  transition:
    background .18s ease,
    color .18s ease,
    transform .18s ease;
}

.settings-close-button:hover {
  background: #eef8f1;
  color: #08783b;

  transform: rotate(3deg);
}

.settings-modal-body {
  padding: 22px 27px;
}

.settings-profile-summary {
  display: flex;
  align-items: center;

  gap: 12px;

  padding: 14px;

  background: #f5fbf7;

  border:
    1px solid #dceee2;

  border-radius: 13px;

  margin-bottom: 20px;
}

.settings-avatar {
  width: 52px;
  height: 52px;

  flex: 0 0 52px;

  border-radius: 50%;

  background: #e1f3e7;
  color: #08783b;

  display: flex;
  align-items: center;
  justify-content: center;

  font-family:
    Georgia,
    "Times New Roman",
    serif;

  font-size: 18px;
  font-weight: 700;
}

.settings-profile-summary strong {
  display: block;

  color: #18261e;

  font-family:
    Georgia,
    "Times New Roman",
    serif;

  font-size: 15px;
}

.settings-profile-summary span:not(.settings-active-badge) {
  display: block;

  margin-top: 3px;

  color: #7a867e;

  font-size: 10px;
}

.settings-active-badge {
  margin-left: auto;

  padding: 6px 9px;

  border-radius: 20px;

  background: #e3f7e9;

  color: #08783b !important;

  font-size: 9px !important;

  font-weight: 800;
}

.settings-section {
  padding: 17px 0;

  border-bottom:
    1px solid #edf1ee;
}

.settings-section:last-child {
  border-bottom: 0;
}

.settings-section-title {
  margin-bottom: 12px;

  color: #27372e;

  font-size: 12px;
  font-weight: 800;
}

.settings-field-grid {
  display: grid;

  grid-template-columns:
    1fr 1fr;

  gap: 12px;
}

.settings-field label {
  display: block;

  margin-bottom: 6px;

  color: #7b867f;

  font-size: 9px;
  font-weight: 700;

  text-transform: uppercase;

  letter-spacing: .45px;
}

.settings-value {
  min-height: 40px;

  display: flex;
  align-items: center;

  padding: 10px 12px;

  background: #f8faf8;

  border:
    1px solid #e2e9e4;

  border-radius: 9px;

  color: #39463e;

  font-size: 11px;

  word-break: break-word;
}

.settings-referral-row {
  display: flex;

  gap: 8px;
}

.settings-referral-row .settings-value {
  flex: 1;
}

.settings-copy-button {
  border: 0;

  border-radius: 9px;

  padding: 0 15px;

  background: #08783b;

  color: #ffffff;

  font-size: 10px;
  font-weight: 800;

  white-space: nowrap;
}

.settings-copy-button:hover {
  background: #066c35;
}

.settings-link-box {
  padding: 12px;

  background: #f8faf8;

  border:
    1px solid #e2e9e4;

  border-radius: 9px;

  color: #5f6c64;

  font-size: 10px;

  line-height: 1.5;

  word-break: break-all;
}

.settings-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;

  gap: 15px;

  padding: 17px 27px;

  background: #fbfcfb;

  border-top:
    1px solid #edf1ee;

  border-radius:
    0 0 20px 20px;
}

.settings-modal-footer span {
  color: #7b867f;

  font-size: 10px;
}

.settings-done-button {
  border: 0;

  border-radius: 9px;

  padding: 10px 19px;

  background: #08783b;

  color: white;

  font-size: 11px;
  font-weight: 800;
}

.settings-done-button:hover {
  background: #066c35;
}

/* =========================================================
   FOOTER
========================================================= */

.footer {
  background: white;

  border-top:
    1px solid #e4ebe6;

  padding: 20px;

  text-align: center;

  color: #7b857f;

  font-size: 10px;
}

.footer div {
  color: #08783b;

  font-weight: 800;

  letter-spacing: 1px;

  margin-bottom: 5px;
}

/* =========================================================
   RESPONSIVE
========================================================= */

@media (max-width: 1200px) {

  .stats-grid {
    grid-template-columns:
      repeat(2, 1fr);
  }

}

@media (max-width: 950px) {

  .sidebar {
    width: 220px;
  }

  .main {
    padding: 22px;
  }

  .two-grid {
    grid-template-columns: 1fr;
  }

  .commission-grid {
    grid-template-columns:
      repeat(2, 1fr);
  }

  .hero-visual {
    display: none;
  }

}

@media (max-width: 700px) {

  .topbar {
    padding: 0 18px;
  }

  .sidebar {
    width: 190px;
  }

  .main {
    padding: 15px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .hero-content {
    padding: 30px 25px;
  }

  .hero h1 {
    font-size: 29px;
  }

  .payout-banner {
    flex-direction: column;

    align-items: flex-start;

    gap: 18px;
  }

  .payout-action {
    width: 100%;

    justify-content:
      space-between;
  }

}

@media (max-width: 560px) {

  .sidebar {
    display: none;
  }

  .main {
    width: 100%;
  }

  .commission-grid {
    grid-template-columns: 1fr;
  }

  .order-summary {
    flex-direction: column;
  }

  .hero-actions {
    flex-direction: column;
  }

  .hero-button {
    width: 100%;
  }

  .referral-box {
    flex-direction: column;
  }

  .referral-box button {
    padding: 12px;
  }

  .share-buttons {
    flex-wrap: wrap;
  }

}

/* =========================================================
   MODERN TOP PROFILE
========================================================= */

.profile-menu-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.top-profile-button {
  appearance: none;
  -webkit-appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 190px;
  height: 58px;
  padding: 7px 14px 7px 8px;
  margin: 0;
  background: #ffffff;
  border: 1px solid #e2e9e4;
  border-radius: 12px;
  color: #18261e;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease;
}

.top-profile-button:hover,
.top-profile-button:focus-visible {
  border-color: #b9d8c2;
  box-shadow: 0 5px 18px rgba(8,120,59,.10);
  outline: none;
}

.top-profile-button:active {
  transform: translateY(1px);
}

.top-profile-button .avatar {
  width: 42px;
  height: 42px;
  min-width: 42px;
  flex: 0 0 42px;
  border-radius: 50%;
  background: #e1f3e7;
  color: #08783b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 16px;
  font-weight: 700;
}

.top-profile-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.top-profile-info strong {
  display: block;
  margin: 0;
  color: #18261e;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.top-profile-info small {
  display: block;
  margin: 4px 0 0;
  color: #7b867f;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.profile-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 190px;
  padding: 7px;
  background: #ffffff;
  border: 1px solid #e2e9e4;
  border-radius: 12px;
  box-shadow: 0 12px 30px rgba(20,45,30,.14);
  z-index: 1000;
  box-sizing: border-box;
}

.profile-dropdown button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  margin: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #39463e;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.profile-dropdown button:hover,
.profile-dropdown button:focus-visible {
  background: #eef8f1;
  color: #08783b;
  outline: none;
}

.profile-dropdown .dropdown-icon {
  width: 20px;
  flex: 0 0 20px;
  text-align: center;
  font-size: 15px;
}

.profile-dropdown-divider {
  height: 1px;
  margin: 4px 6px;
  background: #edf1ee;
}

.profile-dropdown .profile-logout:hover,
.profile-dropdown .profile-logout:focus-visible {
  background: #fff3f3;
  color: #c0392b;
}

@media (max-width: 650px) {
  .settings-modal-overlay {
    align-items: flex-end;
    padding: 10px;
  }

  .settings-modal {
    max-height: calc(100vh - 20px);
    border-radius: 18px;
  }

  .settings-modal-header {
    padding: 20px;
  }

  .settings-modal-body {
    padding: 17px 20px;
  }

  .settings-modal-footer {
    padding: 15px 20px;
  }

  .settings-field-grid {
    grid-template-columns: 1fr;
  }

  .settings-profile-summary {
    flex-wrap: wrap;
  }

  .settings-active-badge {
    margin-left: 64px;
    margin-top: -4px;
  }

  .settings-referral-row {
    flex-direction: column;
  }

  .settings-copy-button {
    height: 40px;
  }
}

@media (max-width: 560px) {
  .topbar {
    padding: 0 12px;
  }

  .top-profile-button {
    min-width: 0;
    width: 172px;
    padding-right: 10px;
  }

  .top-profile-info strong {
    font-size: 13px;
  }
}


/* =========================================================
   PROFILE MENU - FINAL OVERRIDE
   ========================================================= */

.topbar {
  position: sticky;
  z-index: 10000;
  overflow: visible !important;
}

.profile-menu-wrapper {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  z-index: 10001 !important;
}

.top-profile-button {
  position: relative !important;
  z-index: 10002 !important;
  appearance: none !important;
  -webkit-appearance: none !important;
  border: 1px solid #e2e9e4 !important;
  border-radius: 12px !important;
  background: #ffffff !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  width: 210px !important;
  min-width: 210px !important;
  height: 58px !important;
  padding: 7px 14px 7px 8px !important;
  cursor: pointer !important;
  text-align: left !important;
}

.top-profile-button .avatar {
  display: flex !important;
  flex: 0 0 42px !important;
  width: 42px !important;
  height: 42px !important;
  min-width: 42px !important;
  border-radius: 50% !important;
}

.top-profile-info {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: center !important;
  flex: 1 !important;
}

.profile-dropdown {
  position: absolute !important;
  top: calc(100% + 8px) !important;
  right: 0 !important;
  width: 210px !important;
  min-width: 210px !important;
  padding: 7px !important;
  display: block !important;
  background: #ffffff !important;
  border: 1px solid #dfe9e2 !important;
  border-radius: 12px !important;
  box-shadow: 0 14px 35px rgba(20,55,35,.18) !important;
  z-index: 999999 !important;
  box-sizing: border-box !important;
}

.profile-dropdown button {
  width: 100% !important;
  height: 42px !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 10px 12px !important;
  border: 0 !important;
  border-radius: 8px !important;
  background: transparent !important;
  cursor: pointer !important;
  text-align: left !important;
}

.profile-dropdown button:hover {
  background: #eef8f1 !important;
}

@media (max-width: 700px) {
  .top-profile-button {
    width: 185px !important;
    min-width: 185px !important;
  }

  .profile-dropdown {
    right: 12px !important;
  }
}


`;