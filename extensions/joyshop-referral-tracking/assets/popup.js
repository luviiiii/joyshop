/*
 * JOYSHOP Ambassador Popup
 *
 * - Calls the JOYSHOP app proxy to check eligibility server-side.
 * - Never trusts browser-supplied spend amounts.
 * - No Admin API tokens or database credentials ever touch this file.
 * - Shows the popup once per eligible customer (server marks
 *   notifiedAt so a repeat check returns eligible: false).
 * - "Join Now" calls the app proxy to actually create the
 *   ambassador record server-side.
 */

(function () {
  "use strict";

  const SESSION_SEEN_KEY = "joyshop_ambassador_popup_seen";

  function getElements() {
    return {
      overlay: document.getElementById("joyshop-ambassador-popup"),
      closeBtn: document.getElementById("joyshop-popup-close"),
      joinBtn: document.getElementById("joyshop-popup-join-btn"),
      laterBtn: document.getElementById("joyshop-popup-later-btn"),
      message: document.getElementById("joyshop-popup-message"),
      commissionText: document.getElementById(
        "joyshop-popup-commission-text"
      ),
    };
  }

  function showPopup(elements) {
    elements.overlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hidePopup(elements) {
    elements.overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function setMessage(elements, text, isError) {
    if (!elements.message) return;

    elements.message.textContent = text || "";
    elements.message.className = isError
      ? "joyshop-popup-message joyshop-popup-error"
      : "joyshop-popup-message joyshop-popup-success";
  }

  async function checkEligibility() {
    try {
      const response = await fetch("/apps/joyshop/eligibility", {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error("JOYSHOP eligibility check failed:", error);
      return null;
    }
  }

  async function becomeAmbassador() {
    try {
      const response = await fetch("/apps/joyshop/become-ambassador", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      return await response.json();
    } catch (error) {
      console.error("JOYSHOP become-ambassador failed:", error);
      return {
        success: false,
        error: "Something went wrong. Please try again.",
      };
    }
  }

  function updateCommissionText(elements, rate) {
    if (!elements.commissionText || !rate) return;

    elements.commissionText.textContent = `Earn up to ${rate}% Commission`;
  }

  async function init() {
    const elements = getElements();

    if (!elements.overlay) {
      return;
    }

    /*
     * Only ever attempt this once per browser session so we
     * don't spam the eligibility endpoint on every page view.
     */

    if (sessionStorage.getItem(SESSION_SEEN_KEY) === "true") {
      return;
    }

    const data = await checkEligibility();

    if (!data || !data.eligible) {
      sessionStorage.setItem(SESSION_SEEN_KEY, "true");
      return;
    }

    sessionStorage.setItem(SESSION_SEEN_KEY, "true");

    if (data.commissionRate) {
      updateCommissionText(elements, data.commissionRate);
    }

    showPopup(elements);

    elements.closeBtn.addEventListener("click", function () {
      hidePopup(elements);
    });

    elements.laterBtn.addEventListener("click", function () {
      hidePopup(elements);
    });

    elements.overlay.addEventListener("click", function (event) {
      if (event.target === elements.overlay) {
        hidePopup(elements);
      }
    });

    elements.joinBtn.addEventListener("click", async function () {
      elements.joinBtn.disabled = true;
      elements.joinBtn.textContent = "Joining...";

      const result = await becomeAmbassador();

      if (result.success) {
        setMessage(
          elements,
          result.alreadyAmbassador
            ? "You're already an ambassador!"
            : `You're in! Your referral code is ${result.referralCode}.`,
          false
        );

        elements.joinBtn.textContent = "Joined!";

        setTimeout(function () {
          hidePopup(elements);
        }, 2500);

      } else {
        setMessage(elements, result.error || "Something went wrong.", true);

        elements.joinBtn.disabled = false;
        elements.joinBtn.textContent = "Join Now";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
